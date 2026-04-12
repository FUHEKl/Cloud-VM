# RSI/Server Teammate Handoff (Sections to Fill)

Use this as a checklist for the teammate responsible for server/OpenNebula/infra.

## 1) OpenNebula topology
- Controller(s), hypervisors, datastore/storage nodes.
- Network segmentation (VLANs, internal/external networks).
- Access paths between app services and OpenNebula APIs.

## 2) Provisioning workflow
- VM template creation/update process.
- Golden image source and update policy.
- Automation scripts and execution flow.

## 3) Security architecture
- Firewall rules and allowed ports.
- Reverse proxy and TLS termination details.
- Secret/certificate management approach.
- Access control model (admins/operators/users).

## 4) Operations and monitoring
- Log collection and retention strategy.
- Metrics and alerting rules.
- Incident handling process (detection, triage, mitigation).

## 5) Backup and disaster recovery
- Backup strategy and schedule.
- Restore procedure and RTO/RPO targets.
- Failover constraints and known risks.

## 6) KPI measurements (for report tables)
- VM provisioning average time.
- VM operation success/failure rates.
- Infra availability/uptime.
- Resource utilization baselines (CPU/RAM/storage).

## Deliverables to provide
- One architecture diagram image (PNG/SVG).
- 2-4 screenshots (OpenNebula dashboard/config views).
- A short text block per section (can be copied into Chapter "Infrastructure and OpenNebula Integration").
