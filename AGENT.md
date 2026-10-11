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
