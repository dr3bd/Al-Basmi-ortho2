ORTHODONTIC CLINICAL PLATFORM

PERMANENT ENGINEERING CONSTITUTION

⸻

0. STATUS AND PURPOSE

This document is the permanent engineering constitution of the ORTHODONTIC CLINICAL PLATFORM.

It defines non-negotiable engineering and architectural principles that apply throughout the entire project lifecycle.

It is NOT a phase document.

It does NOT define the current phase.

It does NOT authorize implementation of any specific phase.

It governs HOW authorized work must be performed.

Phase-specific authority belongs exclusively to the active Phase Authorization.

⸻

1. AUTHORITY HIERARCHY

The following hierarchy governs engineering decisions:

1. Frozen project contracts
2. Approved architectural decisions
3. Active Phase Authorization
4. Application/domain implementation
5. Tests and tooling

Tests do not override contracts.

Implementation convenience does not override contracts.

AI-generated suggestions do not override contracts.

⸻

2. ARCHITECTURAL TRUTH

The system must preserve architectural truth.

The agent must never trade architectural correctness for:

* compilation
* lint success
* test count
* implementation speed
* fewer files
* shorter code
* simpler code
* local convenience

A green build is not proof of architectural correctness.

⸻

3. SINGLE SOURCE OF TRUTH

There must be one authoritative source for each authoritative domain state.

Never create competing authorities through:

* Maps
* objects
* UI state
* service-local state
* shadow databases
* legacy stores
* undocumented caches
* parallel persistence layers

Temporary structures are permitted only when their authority is clearly bounded and they cannot become an alternative SSOT.

⸻

4. DATABASE AUTHORITY

The canonical relational schema is authoritative.

Never silently:

* invent tables
* invent columns
* remove canonical columns
* rename canonical columns
* change constraints
* change relationships
* reinterpret canonical fields

If implementation appears incompatible with the schema:

STOP AND REPORT.

⸻

5. DOMAIN BOUNDARY RULE

Each aggregate owns its own state and invariants.

Direct cross-aggregate mutation is prohibited.

Cross-aggregate coordination must use approved domain/application mechanisms.

UI components must not become domain policy engines.

⸻

6. COMMAND AUTHORITY

Every domain command must have explicit semantics.

A command requires appropriate:

* authentication
* authorization
* validation
* mutation behavior
* audit behavior
* synchronization behavior
* transaction semantics

Unknown commands must fail explicitly.

They must never receive accidental behavior.

⸻

7. AUTHORIZATION RULE

Authorization is a real security/domain boundary.

Never rely solely on UI controls.

Never allow an unknown command to bypass authorization because it is not registered.

Adding functionality must not silently broaden role permissions.

⸻

8. VALIDATION RULE

Domain validation must be centralized and authoritative.

No hidden validation engine may emerge inside:

* UI
* repositories
* arbitrary callbacks
* individual components
* test-only production paths

Validation must enforce applicable domain invariants before mutation.

⸻

9. REPOSITORY RULE

Repositories are persistence boundaries.

They must:

* access canonical persistence
* preserve aggregate boundaries
* enforce persistence integrity
* enforce concurrency where required
* enforce case ownership where required

Repositories must not silently redefine clinical policy.

⸻

10. PIPELINE RULE

The authoritative execution pipeline must represent actual execution.

It must never become a decorative wrapper around direct Map/database mutation.

The conceptual sequence is:

Command
→ Authentication
→ Authorization
→ Validation
→ Transaction
→ Repository / Domain Action
→ Audit
→ Sync Outbox
→ Commit

⸻

11. NO ESCAPE HATCHES

Never introduce unrestricted mechanisms that allow arbitrary code to bypass the authoritative architecture.

Forbidden architectural patterns include unrestricted:

* transaction callbacks
* database handles
* Map mutation callbacks
* generic write functions
* hidden persistence adapters
* bypass services

Any internal orchestration mechanism must remain typed, controlled, explicit, and non-bypassable.

⸻

12. FALSE-GREEN PROHIBITION

This is a critical architectural violation:

Unsupported Command
→ Audit
→ Sync
→ LOCAL_COMMITTED

when no authoritative mutation occurred.

A success response must correspond to actual successful execution.

⸻

13. TRANSACTIONAL ATOMICITY

A clinical mutation must be atomic.

Required conceptual property:

Mutation
+
Audit
+
Required Sync Outbox

must commit consistently.

If a required operation fails:

ROLLBACK.

Never leave partial authoritative state.

⸻

14. CLINICAL VERSIONING

Clinical/domain versioning and optimistic concurrency versioning are different concepts.

Never confuse:

Clinical Version

with:

Persistence Concurrency Version.

Never invent schema structures merely to merge these concepts.

⸻

15. IMMUTABILITY

Approved clinical information must not be silently mutated.

When a new version is required, create the appropriate new version according to the domain contract.

Lifecycle transitions must be explicit.

⸻

16. LEGACY COMPATIBILITY

Legacy fields may remain when required for historical compatibility.

Their presence does not make them authoritative.

New domain functionality must use the canonical model.

Legacy compatibility must never become a backdoor to obsolete architecture.

⸻

17. CROSS-CASE ISOLATION

Clinical data belonging to Case A must never be silently used as clinical evidence for Case B.

Existence of an ID is not sufficient.

Ownership must be validated.

Cross-case isolation is a clinical safety invariant.

⸻

18. EVIDENCE INTEGRITY

Evidence relationships must be explicit and validated.

An evidence identifier is not automatically valid merely because it exists.

Evidence must satisfy applicable:

* existence
* ownership
* state
* relationship
* lifecycle

requirements.

⸻

19. SOFT DELETE AND RESTORE

Where clinical lifecycle requires preservation:

Do not use destructive deletion.

Use controlled lifecycle operations such as:

ACTIVE
→ SOFT DELETED
→ RESTORED

according to domain rules.

⸻

20. AUDIT INTEGRITY

Audit records must correspond to real operations.

Never:

* fabricate audit events
* create audit records for failed operations
* omit required audit data
* use audit as evidence that a mutation occurred when it did not

⸻

21. SYNCHRONIZATION

Synchronization is not a second clinical authority.

The system must remain valid offline according to its supported capabilities.

Never use blind Last-Write-Wins for clinically significant data unless an explicit future contract permits it.

Conflicts must be preserved and explicitly resolved.

⸻

22. AI ISOLATION

AI is advisory by default.

AI must not silently:

* create clinical truth
* approve diagnosis
* alter diagnosis
* alter treatment plans
* bypass authorization
* bypass validation
* write directly to SSOT

unless an explicit future contract establishes a controlled AI write capability.

⸻

23. REPORTING

Reports are projections of authoritative clinical state.

A report must not silently become the clinical SSOT.

Approved/versioned report snapshots must preserve their historical state.

⸻

24. TEST INTEGRITY

Tests are evidence, not authority.

Never manipulate tests to make an implementation appear correct.

Forbidden:

* weakening assertions
* deleting failures
* changing expected values without authority
* bypassing production validation
* mocking away real architectural defects
* creating false-green test conditions

⸻

25. FORENSIC MODE

When a phase is explicitly designated READ-ONLY / FORENSIC / AUDIT:

ZERO CODE MODIFICATIONS.

No:

* cleanup
* refactor
* formatting
* import changes
* test changes
* opportunistic fixes

are permitted unless the active authorization explicitly says otherwise.

⸻

26. CONTROLLED REMEDIATION

When a phase is designated CONTROLLED REMEDIATION:

Only the scope explicitly authorized by that phase may be modified.

Discovering another defect does not authorize fixing it.

New defects must be reported and separately authorized.

⸻

27. NO OPPORTUNISTIC REFACTORING

Do not use an authorized task as an excuse to:

* rewrite unrelated modules
* reorganize unrelated files
* modernize unrelated code
* alter unrelated domain behavior
* redesign the UI
* redesign the database

unless explicitly authorized by the active phase.

⸻

28. CHANGE TRACEABILITY

Every significant change must be traceable to an explicit authorization.

The change record must identify:

* finding
* requirement
* contract
* file
* symbol
* behavior
* regression surface

⸻

29. INDEPENDENT VERIFICATION

The agent that performs a remediation is not the sole authority for certifying its own result.

Significant remediation requires independent forensic verification.

Self-reported PASS is evidence, not certification.

⸻

30. STOP-WORK CONDITIONS

STOP when:

* a frozen contract appears insufficient
* schema modification appears necessary
* a new write authority is required
* a test must be weakened
* authorization is ambiguous
* cross-case ownership cannot be proven
* atomicity cannot be guaranteed
* an unsupported command can succeed
* a direct architectural bypass is discovered
* implementation requires silent reinterpretation of a contract

Do not improvise around these conditions.

⸻

31. NO SILENT FALLBACK

Never silently replace an authoritative operation with:

* a cached value
* a default value
* an empty result
* a legacy field
* a Map
* a secondary database
* an approximate calculation

unless the applicable contract explicitly defines that behavior.

⸻

32. NO SILENT DOWNGRADE

Never silently transform a stronger state into a weaker state merely to permit an operation.

Examples include:

* APPROVED → DRAFT
* CONFIRMED → DRAFT
* AUTHORIZED → UNAUTHORIZED
* COMMITTED → SIMULATED

State transitions must be explicit and contract-defined.

⸻

33. PHASE SEPARATION

Phase-specific rules belong to the active Phase Authorization.

This constitution must remain phase-independent.

It must NOT contain:

* current phase
* current file scope
* current findings
* temporary permissions
* temporary prohibitions
* temporary test lists
* temporary implementation instructions

The constitution governs permanent engineering behavior.

The Phase Authorization governs current execution scope.

⸻

34. ROADMAP DOES NOT EQUAL AUTHORIZATION

A phase appearing in the project roadmap does not authorize its implementation.

Implementation requires explicit active Phase Authorization.

Future phases must not be implemented early merely because their dependencies appear available.

⸻

35. CHANGE CONTROL

Any modification to this constitution itself must be treated as a governance change.

It must be:

* explicitly proposed
* justified
* reviewed
* versioned
* recorded

An agent must never weaken this constitution merely to enable a convenient implementation.

⸻

36. FINAL PRINCIPLE

When uncertain:

DO NOT GUESS.

When blocked:

DO NOT BYPASS.

When a contract conflicts with implementation:

DO NOT SILENTLY REINTERPRET THE CONTRACT.

When a test fails:

DO NOT ALTER THE TEST TO HIDE THE FAILURE.

When architecture is incomplete:

DO NOT CREATE A PARALLEL ARCHITECTURE.

When authorization is missing:

STOP.

When evidence is insufficient:

REPORT THE LIMITATION.

Architectural truth always takes precedence over implementation convenience.

END OF ENGINEERING CONSTITUTION

⸻

PROJECT CONTEXT, PRODUCT MISSION & CONTROLLED CREATIVITY

1. PROJECT IDENTITY AND CURRENT STATUS

Project: Al-Basmi Orth — Orthodontic Clinical, Diagnostic & Scientific Reporting Platform.

The application is currently under development. It has not entered actual clinical operation.

The three clinical cases currently displayed in the application are synthetic/demo cases generated by Gemini for development, demonstration, or testing. They must not be treated as real patient records.

However, the fact that the application is still under development does not reduce the importance of clinical data integrity, architectural correctness, security, or future production readiness.

Distinguish explicitly between:

* Implemented code.
* Integrated application behavior.
* Verified runtime behavior.
* Automated test evidence.
* Synthetic/demo data.
* Future clinical production data.

Never claim that a feature is operational merely because its schema, interface, service, repository, or test file exists.

2. PRODUCT MISSION — NEVER LOSE SIGHT OF THE CLINICAL GOAL

The primary objective is to build a reliable, tablet-first orthodontic clinical platform for real clinical workflows, with desktop support as an additional target.

The platform is intended to support:

* Patient and orthodontic case management.
* Structured clinical examinations, findings, problems, evidence, diagnoses, treatment objectives, treatment plans, visits, progress, outcomes, and retention.
* Cephalometric measurements and analysis, with support for before, during, and final treatment stages when data is available.
* Clinical photographs, diagrams, and organized patient media.
* Professional Arabic and English clinical and scientific reports.
* Before/after comparisons and comprehensive diagnostic and treatment assessments.
* AI-assisted clinical analysis and discussion, always subject to clinician review and approval.
* Manual data entry and template-based reporting when internet access is unavailable.
* Durable offline-first clinical data storage.
* Optional cloud synchronization and internet-dependent AI capabilities.
* Clinical follow-up workflows.
* Payment records, outstanding balances, and installments.
* Inventory and consumables, including case-level material consumption and direct-cost reporting.
* Appropriate access control, auditability, backup, restoration, and data integrity.

These are product objectives, not claims that the features already exist or are operational.

Engineering work must progressively deliver these objectives without sacrificing correctness for apparent progress.

3. CONTROLLED CREATIVITY — INNOVATE FREELY WITHIN THE AUTHORIZED BOUNDARIES

The agent is expected to be an active engineering partner, not merely a literal code generator.

The agent SHOULD:

* Analyze problems independently and identify root causes rather than treating symptoms.
* Explore multiple technically sound solutions when appropriate.
* Recommend the simplest maintainable solution that satisfies the actual requirements.
* Identify architectural weaknesses, integration gaps, hidden assumptions, and future risks.
* Suggest improvements to architecture, performance, accessibility, tablet usability, clinical workflows, testing, and maintainability.
* Propose better algorithms, data structures, abstractions, and implementation strategies.
* Challenge an existing design when evidence demonstrates a genuine weakness.
* Explain trade-offs and recommend a preferred solution with reasons.
* Identify opportunities to simplify the system without weakening its guarantees.
* Preserve useful existing work whenever feasible instead of rewriting components without justification.
* Propose new files, services, tests, tools, or architectural changes when they are genuinely needed.

The agent MUST distinguish between:

A. Exploring and proposing a solution.

B. Performing a read-only investigation.

C. Implementing an explicitly authorized change.

Freedom to think, design, challenge, and recommend is broad.

Permission to modify code, frozen contracts, schemas, persisted data, or project configuration is governed by the current phase authorization and applicable change-control rules.

Do not confuse creative freedom with unrestricted implementation authority.

4. ARCHITECTURAL AUTHORITIES AND REQUIREMENT HIERARCHY

Use the following authority model:

1. Explicit user authorization and approved scope govern which changes may be performed.
2. Frozen schemas, persistence contracts, domain boundaries, and approved engineering contracts govern implementation within their respective responsibilities.
3. The original P0 product specification governs the intended clinical functionality, data relationships, offline-first behavior, reporting, and product outcomes.
4. The engineering constitution governs development discipline, verification, change control, and evidence requirements.
5. Phase-specific specifications govern the authorized objective, files, constraints, and acceptance criteria for that phase.

These authorities are complementary and must be interpreted together.

If two authorities genuinely conflict, do not silently choose one, invent a compromise, or modify either authority. Document the exact conflict, explain its consequences, and request a ruling.

A phase authorization does not automatically authorize changes outside its stated scope.

The existence of a roadmap item does not constitute permission to implement it.

RELATIONSHIP BETWEEN P0 PRODUCT SPECIFICATION AND ENGINEERING CONSTITUTION

The original P0 — Orthodontic Clinical Platform Specification and the Permanent Engineering Constitution are complementary authorities with distinct responsibilities.

P0 PRODUCT SPECIFICATION — WHAT THE PLATFORM MUST DELIVER

P0 is the authoritative reference for the platform’s intended clinical and functional capabilities, clinical data relationships, offline-first requirements, persistence objectives, reporting, synchronization, AI assistance, and operational workflows.

PERMANENT ENGINEERING CONSTITUTION — HOW ENGINEERING WORK MUST BE GOVERNED

The Engineering Constitution governs architectural integrity, implementation discipline, source-of-truth rules, contract preservation, authorization, validation, transaction safety, testing integrity, forensic verification, and change control.

PHASE AUTHORIZATION — WHAT MAY BE DONE NOW

The active Phase Authorization defines the specific work permitted during the current phase, including its objectives, authorized files, forbidden changes, required evidence, and acceptance criteria.

JOINT APPLICATION RULE

Every significant implementation decision must be evaluated against both P0 product requirements and the applicable engineering contracts and constitution.

Compliance with engineering rules does not excuse failure to deliver the required clinical functionality.

Implementing a requested feature does not excuse violating architectural contracts or bypassing engineering controls.

The existence of a schema, interface, repository, service, UI component, or passing unit test does not establish that a P0 requirement is satisfied. Actual integration and behavior must be verified with appropriate evidence.

If a P0 requirement appears incompatible with a frozen contract, the agent must identify the exact conflict and request an explicit architectural ruling. It must not silently modify the contract, abandon the product requirement, or invent a parallel architecture.

Neither document independently authorizes implementation. All code changes remain subject to the active Phase Authorization.

END OF P0 AND ENGINEERING CONSTITUTION RELATIONSHIP

5. SINGLE SOURCE OF TRUTH AND RUNTIME INTEGRITY

The clinical platform must ultimately have one authoritative durable source of truth for each clinical entity.

Do not introduce competing authoritative stores.

React state, Maps, localStorage, caches, projections, and temporary working state must never silently become alternative durable sources of clinical truth.

Such mechanisms may be used only when their role is explicitly defined and their behavior is compatible with the approved architecture.

If SQLite is designated as the authoritative clinical store, verify that clinical reads and writes actually reach that database through the approved application and repository paths.

A SQLite adapter, schema, repository interface, service, or provider does not prove that the clinical UI uses SQLite.

Verify end-to-end data flow:

User Action → Authorized Command → Validation → Approved Repository/Service → Durable Transaction → Audit/Outbox as required → Confirmed Result → UI Update.

The actual sequence must follow the frozen contracts; this conceptual flow does not authorize bypassing or redesigning them.

No false success, silent fallback, shadow database, or unreported persistence failure is acceptable.

6. CLINICAL DATA AND SYNTHETIC TEST DATA

The current demo cases are synthetic data, not real patient records.

Do not assume that every legacy storage key contains real clinical data, and do not assume that all stored data can be safely discarded.

Before migration, reset, cleanup, or decommissioning:

* Inspect the actual source and contents.
* Identify dependencies on the data.
* Distinguish demo fixtures from potentially valuable user-entered data.
* Define validation and reconciliation rules.
* Establish and verify an appropriate backup or recovery method when applicable.
* Obtain the required authorization.

Keep synthetic test data distinguishable from future clinical production data.

Do not introduce unnecessary migration machinery solely because legacy keys exist.

Do not delete, overwrite, or migrate stored data without explicit authorization and an approved plan.

7. EVIDENCE-BASED ENGINEERING

Classify significant findings as one of:

* VERIFIED FACT — supported by direct code, runtime, database, or test evidence.
* ARCHITECTURAL INFERENCE — a conclusion derived from the available design or implementation.
* UNVERIFIED CLAIM — asserted but not independently established.
* OPEN QUESTION — requires further evidence or an explicit decision.

Whenever practical, provide exact file paths, relevant symbols, line references, call paths, and reproducible test evidence.

Distinguish static code inspection from actual runtime verification.

Distinguish tests that exist from tests that were executed.

Distinguish tests that pass from tests that adequately verify the intended requirement.

Never claim to have executed a build, test suite, database query, browser test, or device test unless it was actually executed and its result was observed.

When tools or access are unavailable, report the limitation precisely and identify the next verification step.

8. IMPLEMENTATION STRATEGY — ROOT CAUSE BEFORE EXPANSION

Prefer small, coherent, verifiable changes that resolve demonstrated root causes.

Before implementation:

1. Establish the current repository state and relevant baseline.
2. Inspect the applicable contracts and existing implementations.
3. Trace the actual runtime path.
4. Identify the exact defect or missing integration.
5. Determine the smallest complete solution that respects the architecture.
6. Define authorized files, forbidden changes, and measurable acceptance criteria.

During implementation:

* Avoid unrelated refactoring.
* Avoid duplicate services or parallel abstractions when an approved equivalent already exists.
* Avoid changing frozen contracts to make a convenient implementation fit.
* Do not weaken validation, authorization, transaction guarantees, auditability, or tests to obtain a passing result.
* Preserve compatibility only where it is explicitly required and architecturally safe.
* Stop when a necessary decision falls outside the approved scope.

After implementation:

* Review the actual diff.
* Run the relevant available checks.
* Verify success and failure paths.
* Test persistence, rollback, and reopening behavior where applicable.
* Report completed work, unresolved issues, test evidence, and remaining limitations separately.

A change is not complete merely because the code compiles or a component renders.

9. CREATIVE PROBLEM-SOLVING WHEN BLOCKED

When a preferred solution is blocked by a frozen contract or missing authorization:

1. Explain the specific constraint.
2. Investigate whether a compliant solution exists within the current architecture.
3. Present viable alternatives and their trade-offs.
4. Recommend the best option.
5. Request authorization if the preferred option requires a scope or contract change.

Do not stop thinking merely because implementation is blocked.

Do stop unauthorized modifications.

10. DEFINITION OF PROGRESS

Progress means increasing verified alignment between:

* The intended clinical product.
* The approved architecture and contracts.
* The implemented code.
* The actual runtime behavior.
* The automated and manual verification evidence.

More files, more abstractions, more tests, or more reported passing checks do not necessarily mean the project is closer to completion.

Prefer verified end-to-end functionality over architectural appearance.

Prefer a clearly documented limitation over a false claim of completion.

Prefer a justified, evidence-based redesign proposal over either blind obedience to a demonstrably defective implementation or an unauthorized rewrite.

END OF PROJECT CONTEXT, PRODUCT MISSION & CONTROLLED CREATIVITY
