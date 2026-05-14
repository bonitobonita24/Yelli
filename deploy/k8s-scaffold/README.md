# Yelli — Kubernetes Scaffold (INACTIVE)

> **Status:** Inactive placeholder. Locked OFF in `inputs.yml` (`deploy.k8s.enabled: false`)
> and `docs/DECISIONS_LOG.md` per Rule 6.

Yelli ships on Docker Compose for dev, staging, and production
(`deploy/compose/{dev,staging,prod}/`) with Komodo as the deployment manager and
Traefik for HTTPS routing (per V27 — `DECISIONS_LOG.md`).

## When to revisit Kubernetes

Activate Kubernetes only when at least one of these is true:

- Horizontal scale demand exceeds what a single Compose host can serve
  (concurrent users approaching 10k+ — the `nfr.concurrent_users_target` in
  `inputs.yml` is currently 100).
- Multi-region active-active deployment is required.
- Customer or compliance contract mandates a managed K8s control plane (EKS,
  GKE, AKS) with autoscaling, pod-level RBAC, or service-mesh policies.

For most office, hospital, and government department deployments, Docker
Compose on a single VM is the better fit — lower operational burden, simpler
disaster recovery, and zero per-pod overhead.

## Activation procedure

Do NOT manually populate this directory. When K8s is genuinely needed:

1. Edit `docs/PRODUCT.md` Non-functional Requirements to declare the K8s
   trigger (scale target, region count, or compliance mandate).
2. Trigger Phase 7: say "Feature Update" in Claude Code.
3. Claude Code flips `deploy.k8s.enabled: true` in `inputs.yml`, generates:
   - `deploy/k8s/base/` (Deployment, Service, Ingress, ConfigMap, Secret)
   - `deploy/k8s/overlays/{staging,prod}/` (Kustomize overlays per env)
   - `deploy/k8s/charts/` (optional Helm chart if PRODUCT.md requests it)
4. Logs a `🟤 decision` to `lessons.md` and adds a locked entry to
   `DECISIONS_LOG.md` documenting the rationale.

## Why this file exists

Rule 6 requires the K8s scaffold to be present-but-inactive so the project
structure is consistent across all Spec-Driven Platform projects. The empty
placeholder signals "we considered K8s and explicitly chose Compose" rather
than "we forgot about K8s".

If you're reading this on a fresh clone and wondering whether to delete it:
**don't**. The directory's presence is the architectural decision marker.
