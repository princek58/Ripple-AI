# Ripple AI — Step R1 Rehearsal Report

Rehearsal performed on 2026-10-25 using isolated QA setup (backend port 4100, frontend port 3100).

## Part 1: Automated Pipeline & Metrics per Project

### Project: `EduZone-master`

- **Archive**: `EduZone-master.zip`
- **Upload**: HTTP 201 in 2632 ms 
- **Scan**: HTTP 200 in 2768 ms 
- **File Count**: 221
- **Files Skipped Notes**: Analyzed 221 files: 289 nodes, 447 edges (6 unresolved). Findings: 5 high, 3 medium, 10 low.
- **Languages**: CSS, EJS, Environment, HTML, JPEG, JPG, JSON, JavaScript, JavaScript (JSX), Markdown, PNG, Unknown, WEBP, XML
- **Graph Architecture**:
  - Total Nodes: 289
  - Total Edges: 447
  - Unresolved Edges: 6
  - Level 1 Modules Count: 3
  - Level 1 Clustered Count: 0
  - Level 1 Graph Response Time: 29 ms
- **Findings Summary (Total: 18)**:
  - **By Rule**:
    - `broken_import`: 5
    - `env_undeclared`: 3
    - `isolated_file`: 10
  - **By Severity**:
    - `high`: 5
    - `medium`: 3
    - `low`: 10
  - **By Confidence**:
    - `confirmed`: 5
    - `likely`: 3
    - `hypothesis`: 10

---

### Project: `School-Management-System_Rad_Project-master`

- **Archive**: `School-Management-System_Rad_Project-master.zip`
- **Upload**: HTTP 201 in 547 ms 
- **Scan**: HTTP 200 in 682 ms 
- **File Count**: 100
- **Files Skipped Notes**: Analyzed 100 files: 133 nodes, 216 edges (5 unresolved). Findings: 1 high, 1 medium, 7 low.
- **Languages**: CSS, HTML, ICO, JPG, JSON, JavaScript, JavaScript (JSX), Markdown, TXT, Unknown
- **Graph Architecture**:
  - Total Nodes: 133
  - Total Edges: 216
  - Unresolved Edges: 5
  - Level 1 Modules Count: 2
  - Level 1 Clustered Count: 0
  - Level 1 Graph Response Time: 14 ms
- **Findings Summary (Total: 9)**:
  - **By Rule**:
    - `broken_import`: 1
    - `env_undeclared`: 1
    - `isolated_file`: 6
    - `circular_dependency`: 1
  - **By Severity**:
    - `high`: 1
    - `medium`: 1
    - `low`: 7
  - **By Confidence**:
    - `confirmed`: 2
    - `hypothesis`: 7

---

### Project: `conduit-realworld-example-app-main`

- **Archive**: `conduit-realworld-example-app-main.zip`
- **Upload**: HTTP 201 in 957 ms 
- **Scan**: HTTP 200 in 486 ms 
- **File Count**: 154
- **Files Skipped Notes**: Analyzed 154 files: 203 nodes, 273 edges (2 unresolved). Findings: 4 medium, 13 low.
- **Languages**: CSS, Environment, HTML, ICO, JPEG, JSON, JavaScript, JavaScript (JSX), Markdown, PNG, TXT, Unknown
- **Graph Architecture**:
  - Total Nodes: 203
  - Total Edges: 273
  - Unresolved Edges: 2
  - Level 1 Modules Count: 3
  - Level 1 Clustered Count: 0
  - Level 1 Graph Response Time: 15 ms
- **Findings Summary (Total: 17)**:
  - **By Rule**:
    - `env_undeclared`: 4
    - `isolated_file`: 13
  - **By Severity**:
    - `medium`: 4
    - `low`: 13
  - **By Confidence**:
    - `likely`: 4
    - `hypothesis`: 13

---

### Project: `vite-mern-template-main`

- **Archive**: `vite-mern-template-main.zip`
- **Upload**: HTTP 201 in 180 ms 
- **Scan**: HTTP 200 in 117 ms 
- **File Count**: 36
- **Files Skipped Notes**: Analyzed 36 files: 38 nodes, 3 edges (0 unresolved). Findings: 5 low.
- **Languages**: CSS, HTML, JSON, JavaScript, Markdown, TypeScript, TypeScript (TSX), Unknown, XML
- **Graph Architecture**:
  - Total Nodes: 38
  - Total Edges: 3
  - Unresolved Edges: 0
  - Level 1 Modules Count: 1
  - Level 1 Clustered Count: 0
  - Level 1 Graph Response Time: 14 ms
- **Findings Summary (Total: 5)**:
  - **By Rule**:
    - `isolated_file`: 5
  - **By Severity**:
    - `low`: 5
  - **By Confidence**:
    - `hypothesis`: 5

---

