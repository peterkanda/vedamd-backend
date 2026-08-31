# Security Policy

VedaMD is clinical decision support infrastructure — security issues here can
have real-world patient-safety impact, so we take reports seriously and ask
that you report privately rather than through a public issue.

## Reporting a vulnerability

Please report suspected vulnerabilities using **GitHub's private vulnerability
reporting**: go to the [Security tab](../../security) of this repository and
select **"Report a vulnerability"**. This opens a private draft advisory
visible only to maintainers until a fix is ready.

Please do not open a public issue, PR, or discussion for a suspected
security vulnerability.

Include, where possible:
- A description of the issue and its potential impact
- Steps to reproduce (a minimal proof of concept is ideal)
- The affected version/commit

## What to expect

- **Acknowledgement:** within 5 business days.
- **Triage:** we'll confirm whether it's in scope and its severity, and keep
  you updated as we work on a fix.
- **Disclosure:** we'll coordinate a disclosure timeline with you once a fix
  is available — typically via a GitHub Security Advisory referencing the
  patched release.

## Scope

In scope: the API and its dependencies as shipped in this repository —
authentication/authorization, the CDS Hooks/REST surface, the signed content
bundle verification pipeline, and data handling.

Out of scope: third-party services this API integrates with (Supabase, LLM
providers, etc.) — please report those directly to the vendor. Denial-of-service
via sheer traffic volume against the hosted `api.vedamd.io` deployment is also
out of scope for this program; report application-level flaws instead.

## Note on patient data

VedaMD is designed to be stateless with respect to patient data — it does not
persist PHI. If you believe you've found a way for patient data to be
retained, logged, or leaked, please treat that as high severity and report it
immediately via the process above.
