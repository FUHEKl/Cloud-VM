# Agile Artifacts (PFE)

## Product Goal
Deliver a secure, scalable, and user-friendly cloud VM management platform with real-time terminal capabilities and OpenNebula integration.

## Definition of Done (DoD)
- Code implemented and reviewed.
- Build passes for impacted services.
- Lint passes for impacted frontend/backend modules.
- API contract documented for changed endpoints.
- Report chapter(s) updated when major feature is delivered.

## Definition of Ready (DoR)
- User story has clear business value.
- Acceptance criteria are testable.
- Dependencies are identified (especially RSI/OpenNebula dependencies).
- Estimation is agreed by team.
- Required environment or mock strategy is available.

## Sprint Template
- Sprint Objective:
- Sprint Duration:
- Planned User Stories:
- Risks:
- Demo Scope:
- Retrospective Actions:

## Product Backlog (Extended)

| ID | User Story | Priority | SP | Owner | Suggested Sprint |
|---|---|---|---:|---|---|
| PB1 | As a visitor, I want to register an account. | High | 3 | Dev | S1 |
| PB2 | As a user, I want secure login with JWT. | High | 5 | Dev | S1 |
| PB3 | As a user, I want refresh token-based session continuity. | High | 5 | Dev | S1 |
| PB4 | As an admin, I want role-aware access. | High | 3 | Dev | S1 |
| PB5 | As a user, I want to view and update my profile. | High | 3 | Dev | S2 |
| PB6 | As a user, I want to add SSH keys. | High | 3 | Dev | S2 |
| PB7 | As a user, I want to list and delete SSH keys. | High | 3 | Dev | S2 |
| PB8 | As a user, I want VM plan visibility. | Medium | 3 | Dev | S2 |
| PB9 | As a user, I want to create a VM from selected plan/template. | High | 8 | Dev | S3 |
| PB10 | As a user, I want to see VM details and status. | High | 5 | Dev | S3 |
| PB11 | As a user, I want to start a VM. | High | 3 | Dev | S3 |
| PB12 | As a user, I want to stop a VM. | High | 3 | Dev | S3 |
| PB13 | As a user, I want to reboot a VM. | Medium | 3 | Dev | S3 |
| PB14 | As a user, I want to delete a VM safely. | High | 5 | Dev | S3 |
| PB15 | As a user, I want to open a real-time terminal. | High | 8 | Dev | S4 |
| PB16 | As a user, I want terminal output to stream continuously. | High | 5 | Dev | S4 |
| PB17 | As a user, I want terminal reconnection behavior. | Medium | 5 | Dev | S4 |
| PB18 | As a user, I want clear terminal error feedback. | Medium | 3 | Dev | S4 |
| PB19 | As a system, I want health endpoints for key services. | Medium | 3 | Dev | S4 |
| PB20 | As a platform owner, I want action audit traces. | Medium | 5 | Dev | S4 |
| PB21 | As a user, I want notification history. | Medium | 3 | Dev | S4 |
| PB22 | As a user, I want quota visibility. | Medium | 3 | Dev | S4 |
| PB23 | As a maintainer, I want robust input validation across APIs. | High | 5 | Dev | S4 |
| PB24 | As a maintainer, I want standardized error responses. | Medium | 3 | Dev | S4 |
| PB25 | As RSI, I want OpenNebula template governance documented. | High | 5 | RSI | S2-S4 |
| PB26 | As RSI, I want infrastructure topology documented. | High | 5 | RSI | S3-S4 |
| PB27 | As RSI, I want secure network/firewall policy for app paths. | High | 8 | RSI | S4 |
| PB28 | As RSI, I want TLS and reverse proxy standards defined. | High | 5 | RSI | S4 |
| PB29 | As RSI, I want backup and restore procedures documented. | High | 5 | RSI | S5 |
| PB30 | As a team, we want deployment runbooks for demos. | High | 5 | Dev + RSI | S5 |
| PB31 | As a team, we want CI checks for build + lint gates. | Medium | 5 | Dev | S5 |
| PB32 | As a team, we want final report traceability matrix. | High | 5 | Dev | S5 |
| PB33 | As a team, we want UML updates synchronized with implementation. | High | 3 | Dev | S5 |
| PB34 | As a team, we want final oral defense support artifacts. | Medium | 3 | Dev + RSI | S5 |

## Sprint Mapping Snapshot

### Sprint 1 (Foundation)
- PB1, PB2, PB3, PB4

### Sprint 2 (User Operations)
- PB5, PB6, PB7, PB8, PB25

### Sprint 3 (VM Lifecycle Core)
- PB9, PB10, PB11, PB12, PB13, PB14, PB26

### Sprint 4 (Terminal + Hardening)
- PB15, PB16, PB17, PB18, PB19, PB20, PB21, PB22, PB23, PB24, PB27, PB28

### Sprint 5 (Finalization)
- PB29, PB30, PB31, PB32, PB33, PB34

## Sprint Backlog Example
| Story ID | Task | Owner | Estimate | Status |
|---|---|---|---:|---|
| PB4 | Stabilize terminal websocket path | Dev | 5 SP | In Progress |
| PB4 | Add reconnect and timeout UX | Dev | 3 SP | Todo |
| PB6 | Validate OpenNebula network mapping | RSI | 5 SP | Todo |

## Retrospective Template
### What went well
- 

### What did not go well
- 

### Actions for next sprint
- 

## Risk Register Template
| Risk | Probability | Impact | Mitigation | Owner |
|---|---|---|---|---|
| OpenNebula API instability | Medium | High | Retry policy + fallback messaging | Dev + RSI |
| Infra access delay | Medium | Medium | Early planning + documented handoff | RSI |
| Integration drift between UML and code | Medium | Medium | Update diagrams at sprint close | Dev |
| Late test campaign | High | High | Timebox final test sprint and prioritize critical scenarios | Dev |

## Sprint Review Evidence Checklist
- Demonstrable UI screenshots for each completed story.
- API endpoint list for delivered backend stories.
- Short changelog of service-level modifications.
- Known issues list and mitigation status.
- Updated report sections linked to sprint outcomes.
