# 🌱 BioSphere  
![NASA Space Apps Challenge](https://img.shields.io/badge/NASA-Space%20Apps%20Challenge%202025-blue)

<p align="center">
  <img src="https://github.com/user-attachments/assets/6bfdd5aa-256c-41e3-b78a-9103a96ae22f" width="110" alt="BioSphere logo">
  <br/>
  <sub><b>NASA Space Biology Visual Network</b></sub>
</p>

---

## 🧭 Summary

**BioSphere** was developed to make exploring NASA’s bioscience research easier, more interactive, and visually engaging.  
The platform gathers **608 scientific publications** and displays them in a **dynamic 2D layout**, where each article connects to others through shared topics.

This visual network enables users to:
- See relationships between studies at a glance.  
- Discover new connections across NASA’s space biology research.  
- Search by keywords, authors, or time periods.  
- Instantly visualize related publications highlighted on the canvas.

By offering a clear and interactive way to navigate NASA’s scientific output, BioSphere helps researchers **save time**, **uncover meaningful connections**, and **strengthen the quality and impact** of their research.

<p align="center">
  <img src="https://github.com/user-attachments/assets/51628146-ed08-49b9-9cc7-d1527cc7fa24" width="700" alt="BioSphere network visualization">
</p>

---

## 🌐 Project Links

🔗 **Demonstration Video / Presentation:**  
[https://www.canva.com/design/DAG02kpnFV4/G57AoV8j6Zc8vk_Gq0bSDA/edit?utm_content=DAG02kpnFV4&utm_campaign=designshare&utm_medium=link2&utm_source=sharebutton](https://www.canva.com/design/DAG02kpnFV4/G57AoV8j6Zc8vk_Gq0bSDA/edit?utm_content=DAG02kpnFV4&utm_campaign=designshare&utm_medium=link2&utm_source=sharebutton)

🚀 **Live Project:**  
[https://ionmateus.github.io/biosphere](https://ionmateus.github.io/biosphere)

---

## 🧬 Project Overview

**BioSphere** is an interactive web platform that enhances the exploration of biological research articles published by NASA.  
It tackles the challenge of navigating and connecting a large volume of scientific papers by **transforming them into a visual network**.

Instead of browsing long static lists, users interact with a **2D canvas of interconnected articles**, where:
- Each **card** represents a publication.  
- Each **line** indicates conceptual similarity.  

This visual structure makes exploring complex scientific topics **intuitive, engaging, and insightful**.

---

## 🧠 Technical Details

The data foundation was built from **608 biology-related NASA publications**, extracted and processed in **Python**.  
For each article, the code collected:
- Title, abstract, authors, keywords, citations, and publication year.  
- The most representative terms within the text (for similarity computation).  

The resulting dataset (≈400,000 lines) powers the two main sections:

### 🔍 Search Page
- Filter and visualize articles by **keywords**, **authors**, or **publication period**.  
- Dynamically highlight connected publications.

### 📊 Insights Page
- Analytical views: **topic evolution**, **citation trends**, and **leading authors**.  
- Helps identify research directions and collaboration networks.

---

## ⚙️ Correlation Between Articles

The similarity network is computed in the `buildSimilarityGraph` function (`cards.js`) using a **multilayered affinity model**:

| Feature | Weight | Description |
|----------|---------|-------------|
| Token similarity | 65% | Jaccard similarity between token sets (title, abstract, keywords). |
| Keyword overlap | ≤35% | Shared normalized terms increase connection strength. |
| Author overlap | ≤25% | Shared surnames strengthen links. |
| Journal bonus | +0.12 | Same journal adds constant affinity boost. |
| Temporal proximity | ≤1 | Close publication years increase similarity. |

A **dynamic threshold (~45th percentile)** ensures balanced density—avoiding both overcrowding and isolation—forming thematic clusters with textual, authorial, and temporal coherence.

---

## 🚀 Impact and Differentiation

Traditional databases present papers in linear lists, limiting the perception of relationships.  
BioSphere redefines this approach by **spatially mapping scientific knowledge**, allowing users to *see* how ideas interconnect.

This shift offers:
- **Immediate recognition** of clusters and emerging topics.  
- **Identification of research gaps** and potential collaborations.  
- A more **creative and exploratory** experience of scientific discovery.

The system is **scalable**, ready to handle tens of thousands of publications across fields — unlocking powerful, data-driven insight into the global scientific landscape.

---

## 🤖 Use of Artificial Intelligence (AI)

AI tools were **not used to generate or modify NASA content**.  
Their role was purely **assistive**, focused on:
- Text correction, translation, and refinement.  
- Supporting code writing in **HTML, CSS, and JavaScript**.

All AI-generated code suggestions (via GPT and Copilot) were:
- **Reviewed, adapted, and improved** by the team.  
- Used **under direct human supervision and creative control**.

All conceptual, functional, and structural decisions were made entirely by the **human team**.

---

## 👥 Team

- Ana  
- Arthur  
- Daniel  
- Ion  
- Pedro  
- Sofia  

---

<p align="center">
  <img src="https://github.com/user-attachments/assets/4e4b5924-196e-4def-879b-a26a24bfe8e2" width="300" alt="NASA Space Apps Challenge logo">
</p>

<p align="center">
  <i>Developed for the NASA Space Apps Challenge 2025 — Exploring knowledge through data, science, and visualization.</i>
</p>
