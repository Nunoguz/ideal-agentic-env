---
name: dpia
description: Draft a data protection impact assessment (docs/compliance/dpia/) for high-risk processing - special-category data, large-scale monitoring, profiling or automated decisions, combined datasets, vulnerable people, AI on personal data, transfers abroad - or when the user or DPO asks for a DPIA.
argument-hint: "<processing activity>"
---

# DPIA

A DPIA is a decision document for the DPO. You draft the facts and the risk analysis. A person signs it off. Never mark a DPIA approved.

## 1. Is one needed?

Check the criteria in `docs/compliance/dpia/README.md`. Two or more usually mean yes. Say which ones apply. If it is borderline, draft a short screening note instead and let the DPO decide.

## 2. Draft `docs/compliance/dpia/<YYYY-MM-DD>-<slug>.md`

1. **Description:** the processing, its purpose, the data elements (link the data inventory activity), the data subjects, the systems, the recipients and processors, transfers abroad, and retention.
2. **Necessity and proportionality:** why this data and not less (minimisation), the legal basis (marked "to confirm"), how people are informed, and how they exercise their rights (access, rectification, erasure, objection).
3. **Risks to people, not to the company:** for each one, likelihood × severity. Examples: unauthorised access, discrimination, loss of control, re-identification, function creep, chilling effect.
4. **Measures:** technical and organisational measures for each risk. Name the real controls in the code: encryption, pseudonymisation, access matrix rows, audit events, retention jobs. Link their tests.
5. **Residual risk and recommendation:** what remains after the measures, and whether the processing should go ahead, change, or go to the authority for prior consultation.
6. **Sign-off:** DPO name, decision, date. Leave it blank for the human.

## 3. Report

Add the assessment to the index table in `docs/compliance/dpia/README.md`. Tell the user which open decisions are needed from the DPO. Do not implement high-risk processing until the user says the DPIA is accepted.
