#!/usr/bin/env python3
import requests
from lxml import etree
from io import BytesIO
import json
import re
from collections import Counter
from datetime import datetime
import sys
import csv

EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

STOPWORDS = {
    "the","and","of","to","in","a","is","for","with","on","that","this","as","by","an","are",
    "we","was","were","be","from","at","or","it","which","these","their","have","has","but",
    "not","may","can","also","our","used","using","use","such","between","than","other","study",
    "studies","results","show","shown","based","data"
}

RE_NON_ALPHANUM = re.compile(r"[^a-z0-9\-]+")

def fetch_pmc_xml(pmc_id):
    if pmc_id.upper().startswith("PMC"):
        raw_id = pmc_id[3:]
    else:
        raw_id = pmc_id
    params = {"db": "pmc", "id": raw_id, "retmode": "xml"}
    resp = requests.get(EFETCH_URL, params=params, timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(f"Erro HTTP {resp.status_code} ao buscar EFETCH: {resp.text[:200]}")
    return resp.content

def text_of_element(el):
    if el is None:
        return ""
    return etree.tostring(el, method="text", encoding="utf-8").decode("utf-8").strip()

def safe_find_first_text(tree, xpath_expr, namespaces=None):
    res = tree.xpath(xpath_expr, namespaces=namespaces)
    if not res:
        return None
    if isinstance(res[0], etree._Element):
        return text_of_element(res[0]).strip()
    else:
        return str(res[0]).strip()

def extract_authors(tree, ns):
    authors = []
    affiliations = {}
    contribs = tree.xpath(".//article-meta//contrib-group//contrib[@contrib-type='author']", namespaces=ns)
    if not contribs:
        contribs = tree.xpath(".//article-meta//contrib-group//contrib", namespaces=ns)
    aff_map = {}
    for aff in tree.xpath(".//article-meta//aff", namespaces=ns):
        aid = aff.get("id")
        aff_text = text_of_element(aff)
        if aid:
            aff_map[aid] = aff_text
    for i, c in enumerate(contribs):
        collab = c.find('.//collab', namespaces=ns)
        if collab is not None:
            name = text_of_element(collab)
        else:
            surname = safe_find_first_text(c, ".//name/surname/text()", namespaces=ns) or ""
            given = safe_find_first_text(c, ".//name/given-names/text()", namespaces=ns) or ""
            name = (given + " " + surname).strip() if (given or surname) else text_of_element(c)
        authors.append(name)
        affs_for_author = []
        for xref in c.xpath(".//xref[@ref-type='aff']", namespaces=ns):
            rid = xref.get("rid")
            if rid and rid in aff_map:
                affs_for_author.append(aff_map[rid])
        if affs_for_author:
            affiliations[i] = affs_for_author
    return authors, affiliations

def extract_pubdata(tree, ns):
    journal = safe_find_first_text(tree, ".//journal-meta//journal-title-group//journal-title/text()", namespaces=ns)
    y = None
    for xpath_try in [
        ".//article-meta//pub-date[@pub-type='epub']//year/text()",
        ".//article-meta//pub-date[@pub-type='ppub']//year/text()",
        ".//article-meta//pub-date//year/text()",
        ".//journal-meta//journal-history//date//year/text()"
    ]:
        ytxt = tree.xpath(xpath_try, namespaces=ns)
        if ytxt:
            try:
                y = int(ytxt[0])
                break
            except:
                continue
    return journal, y

def extract_ids(tree, ns):
    doi = safe_find_first_text(tree, ".//article-meta//article-id[@pub-id-type='doi']/text()", namespaces=ns)
    pmcid = safe_find_first_text(tree, ".//article-id[contains(@pub-id-type,'pmc') or contains(@pub-id-type,'pmcid')]/text()", namespaces=ns)
    return doi, pmcid

def extract_abstract(tree, ns):
    abs_nodes = tree.xpath(".//article-meta//abstract", namespaces=ns)
    parts = []
    for an in abs_nodes:
        txt = text_of_element(an)
        if txt:
            parts.append(txt.strip())
    return "\n\n".join(parts).strip() if parts else None

def extract_keywords(tree, ns):
    kws = []
    for kw in tree.xpath(".//article-meta//kwd-group//kwd", namespaces=ns):
        t = text_of_element(kw).strip()
        if t:
            kws.append(t)
    return kws

def extract_figures(tree, ns, pmcid):
    figs = []
    fig_nodes = tree.xpath(".//fig", namespaces=ns)
    for f in fig_nodes:
        fid = f.get("id") or ""
        title = safe_find_first_text(f, ".//caption//title/text()", namespaces=ns) or None
        caption = safe_find_first_text(f, ".//caption//p/text()", namespaces=ns) or None
        graphic = f.find(".//graphic", namespaces=ns)
        href = None
        if graphic is not None:
            href = graphic.get("{http://www.w3.org/1999/xlink}href") or graphic.get("href") or graphic.get("xlink:href")
        if href:
            pmc_numeric = pmcid.upper().replace("PMC", "") if pmcid else ""
            img_url = f"https://www.ncbi.nlm.nih.gov/pmc/articles/PMC{pmc_numeric}/bin/{href}"
        else:
            img_url = None
        figs.append({"id": fid, "title": title, "caption": caption, "url": img_url})
    return figs

def extract_tables(tree, ns):
    tables = []
    for tw in tree.xpath(".//table-wrap", namespaces=ns):
        tid = tw.get("id") or ""
        caption = safe_find_first_text(tw, ".//caption//p/text()", namespaces=ns) or safe_find_first_text(tw, ".//caption//title/text()", namespaces=ns)
        tables.append({"id": tid, "caption": caption})
    return tables

def extract_citation_ids(tree, ns):
    citation_ids = []
    for pubid in tree.xpath(".//ref-list//pub-id", namespaces=ns):
        t = pubid.text
        if t:
            typ = pubid.get("pub-id-type")
            if typ and ("pmc" in typ.lower() or "pmcid" in typ.lower()):
                citation_ids.append(("pmc", t))
            elif typ and ("doi" in typ.lower()):
                citation_ids.append(("doi", t))
            else:
                citation_ids.append((typ or "unknown", t))
    for ext in tree.xpath(".//ref-list//ext-link", namespaces=ns):
        href = ext.get("xlink:href") or ext.get("href")
        if href:
            if "ncbi.nlm.nih.gov/pmc/articles/PMC" in href:
                m = re.search(r"PMC(\d+)", href)
                if m:
                    citation_ids.append(("pmc", "PMC"+m.group(1)))
            elif "doi.org" in href:
                m = re.search(r"10\.\d{4,9}/\S+", href)
                if m:
                    citation_ids.append(("doi", m.group(0)))
    seen = set()
    out = []
    for typ, val in citation_ids:
        key = f"{typ}:{val}"
        if key not in seen:
            seen.add(key)
            out.append({"type": typ, "id": val})
    return out

def extract_top_terms_from_text(text, topk=20):
    if not text:
        return []
    s = text.lower()
    s = RE_NON_ALPHANUM.sub(" ", s)
    tokens = [t.strip() for t in s.split() if t.strip()]
    tokens = [t for t in tokens if t not in STOPWORDS and len(t) > 2]
    cnt = Counter(tokens)
    most = [w for w, _ in cnt.most_common(topk)]
    return most

def extract_topic_from_terms(terms):
    if not terms:
        return None
    if len(terms) >= 2:
        return f"{terms[0]} {terms[1]}"
    return terms[0]

def process_pmc_to_json(pmc_id):
    xml_bytes = fetch_pmc_xml(pmc_id)
    parser = etree.XMLParser(recover=True)
    tree = etree.parse(BytesIO(xml_bytes), parser)
    root = tree.getroot()
    nsmap = {}
    for k, v in root.nsmap.items():
        if k is None:
            nsmap['def'] = v
        else:
            nsmap[k] = v
    if 'xlink' not in nsmap:
        nsmap['xlink'] = 'http://www.w3.org/1999/xlink'
    xpath_ns = {}
    for k, v in nsmap.items():
        if k == 'def':
            xpath_ns['ns'] = v
        else:
            xpath_ns[k] = v
    doi, pmcid_found = extract_ids(root, xpath_ns)
    pmcid_use = pmcid_found or (pmc_id if pmc_id.upper().startswith("PMC") else "PMC"+str(pmc_id))
    title = safe_find_first_text(root, ".//article-meta//title-group//article-title/text()", namespaces=xpath_ns) \
            or safe_find_first_text(root, ".//front//article-meta//title-group//article-title/text()", namespaces=xpath_ns)
    authors, affiliations = extract_authors(root, xpath_ns)
    journal, year = extract_pubdata(root, xpath_ns)
    abstract = extract_abstract(root, xpath_ns)
    keywords = extract_keywords(root, xpath_ns)
    figures = extract_figures(root, xpath_ns, pmcid_use)
    tables = extract_tables(root, xpath_ns)
    citation_ids = extract_citation_ids(root, xpath_ns)
    body_text = " ".join([text_of_element(sec) for sec in root.xpath(".//body//sec", namespaces=xpath_ns)])
    full_text = " ".join(filter(None, [title, abstract, body_text]))
    top_terms = extract_top_terms_from_text(full_text, topk=100)
    topic = extract_topic_from_terms(top_terms[:4])
    source_url = f"https://pmc.ncbi.nlm.nih.gov/articles/{pmcid_use}/"
    pdf_url = f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid_use}/pdf/"
    fetched_at = datetime.utcnow().isoformat() + "Z"
    return {
        "id": pmcid_use,
        "doi": doi,
        "title": title,
        "provenance": {"source_url": source_url, "pdf_url": pdf_url, "fetched_at": fetched_at},
        "journal": journal,
        "year": year,
        "abstract": abstract,
        "keywords": keywords,
        "top_terms": top_terms,
        "topic": topic,
        "authors": authors,
        "citation_ids": citation_ids,
        "affiliations": affiliations,
        "figures": figures,
        "tables": tables,
    }

if __name__ == "__main__":
    dataset = []
    with open("articles.csv", newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for i, row in enumerate(reader, 1):
            link = row["Link"]
            m = re.search(r"PMC(\d+)", link)
            if not m:
                continue
            pmc_id = "PMC"+m.group(1)

            print(f"[{i}] Processando {pmc_id}...")  # <-- print de progresso

            try:
                article_data = process_pmc_to_json(pmc_id)
                dataset.append(article_data)
            except Exception as e:
                print(f"Erro processando {pmc_id}: {e}", file=sys.stderr)
    with open("dataset.json", "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)
    print(f"Dataset completo salvo em dataset.json ({len(dataset)} artigos)")
