# CAREMAP

## Healthcare discovery with evidence, not just listings

CAREMAP discovers non-governmental organizations in Nigeria that offer free or
subsidized healthcare services from public sources, then structures the
evidence behind those claims.

Instead of simply saying:

> "This non-governmental organization provides maternal health services."

CAREMAP helps answer:

> "What does this organization publicly claim to provide, where is it
located, how can people access it, and what evidence supports the claim?"

## Why CAREMAP exists

Healthcare information about services provided by non-governmental
organizations in Nigeria is scattered across organization websites,
directories, program pages, announcements, and other public sources.

A directory can tell you that an organization exists.

CAREMAP goes further by connecting:

**Organization → Service → Location → Access → Evidence**

It also preserves uncertainty.

If information cannot be publicly verified, CAREMAP does not treat that as
proof that the service does not exist. It reports the information as **not
publicly verified**.

## What CAREMAP extracts

Depending on the available public evidence, CAREMAP can identify:

- Organization name and description
- Organization type
- Health areas
- Services
- Target populations
- Locations
- Public contact information
- Website information
- Appointment requirements
- Referral requirements
- Other publicly documented access requirements
- Supporting source URLs
- Evidence snippets
- Evidence status
- Last verification timestamp

## Evidence model

Every important claim can carry evidence describing:

- The claim
- Source URL
- Source type
- Source tier
- Source title
- Evidence snippet
- Date checked
- Evidence status

### Evidence statuses

**source_backed**

The claim is supported by at least one public source.

**independently_corroborated**

The same service claim is supported by independent source types, such as
an established directory and the organization's official website.

**conflicting**

Available sources contain materially different information.

**stale**

The available evidence is too old to confidently represent the current
situation.

**not_publicly_verified**

CAREMAP could not find sufficient public evidence to support the claim.

**Not publicly verified does not mean the service does not exist.**

The same principle governs what happens when a whole search comes back
empty — see "When no NGOs are found" below.

## Source hierarchy

CAREMAP distinguishes sources rather than treating every webpage as
equally authoritative.

Current source tiers include:

1. Official government registry
2. Organization official website
3. Official organization social account
4. Established directory
5. News or third-party source
6. Unverified mention

## Current discovery pipeline

For the current MVP, CAREMAP can:

1. Discover relevant healthcare organizations from public directories.
2. Filter results by health area and location.
3. Open organization profiles.
4. Extract organization information and public contact details.
5. Discover the organization's official website when available.
6. Crawl relevant pages on that website.
7. Extract service claims and access information.
8. Attach evidence to those claims.
9. Resolve potential duplicate organizations.
10. Merge evidence from multiple sources.
11. Produce a structured dataset.

Directory discovery currently runs against NGOBase's Nigeria listings.
NGOBase organizes NGOs by country, then by "work area" (e.g. Health) and
"sub work area" (e.g. Maternal Health, Free Dental Care). CAREMAP maps each
supported health area to the closest real NGOBase category it can find:
some health areas (Maternal Health, Mental Health, Free Dental Care, Free
Eye Care, Population Welfare, WASH, Disability Support, Malaria, HIV/AIDS)
have a dedicated NGOBase category; others (Reproductive Health, Family
Planning, Child Health, Rehabilitation, Laboratory Services) do not, so
CAREMAP seeds the search from the nearest related category instead and
relies more heavily on keyword and alias matching against each
organization's tagged health areas and description to narrow the result
down. Location filtering works the same way: it maps to NGOBase's Nigerian
state-level listings where one exists, and falls back to the national
Health listing plus text filtering otherwise.

## Supported health areas

The `healthArea` input accepts (case-insensitive):

- Maternal health
- Reproductive health
- Family planning
- Child health
- Mental health
- Population welfare
- WASH (water, sanitation and hygiene)
- Disability support
- Malaria
- HIV/AIDS
- Nutrition / hunger
- Dental care (dental, dental health, oral health)
- Eye care (vision, ophthalmology)
- Rehabilitation (physical therapy, physiotherapy)
- Laboratory services (laboratory, lab services, diagnostics)

Health areas without a dedicated NGOBase category (currently: reproductive
health, family planning, child health, rehabilitation, and laboratory
services) are matched against the closest real category plus text/alias
matching, so results for those areas should be treated as a starting point
rather than an exact tag match.

## When no NGOs are found

A health area and location search can legitimately come back with zero
organizations — that's expected, not an error. NGOBase's categories are
real, but some are sparsely populated for Nigeria; "Free Dental Care", for
example, currently lists no organizations nationally even though the
category itself is a genuine part of NGOBase's taxonomy.

When this happens, CAREMAP does not just return an empty list. It reports
a clear, well-formatted summary explaining:

- That no matching organizations were found for this run
- That this does not mean the service doesn't exist — only that no public
  listing matching both filters could be verified (the same
  "not_publicly_verified" principle that governs individual evidence
  claims)
- Whether the health area searched has a dedicated NGOBase category, or
  used a closest-match fallback (which affects how much a zero result
  should be trusted as conclusive)
- Concrete next steps: broadening the location, raising the organization
  limit, trying a related health area, or re-running later as listings
  change
- What was actually searched (health area, location, and source page(s)
  checked) and when

## Example

Input:

```text
Health area: maternal health
Location: Lagos
Maximum organizations: 25
Include evidence: true

Output example:

Organization:
The Wellbeing Foundation Africa

Health areas:
- Maternal health
- Reproductive health
- Child health

Services:
- Postnatal care
- Family planning
- Nutrition support
- Immunization
- Health education

Evidence:
- Organization directory source
- Official website pages
- Supporting evidence snippets
- Timestamp showing when the information was checked

Evidence status:
source_backed
or
independently_corroborated

Exact results depend on the public information
available at the time of the run.
```

## Screenshots

### Actor input
![CAREMAP Actor input](https://raw.githubusercontent.com/Nekah-Lumina/caremap/main/screenshots/caremap-input.png)
 
### Successful run
![CAREMAP successful run](https://raw.githubusercontent.com/Nekah-Lumina/caremap/main/screenshots/caremap-run-success.png)
 
### Structured output
![CAREMAP structured output](https://raw.githubusercontent.com/Nekah-Lumina/caremap/main/screenshots/caremap-output.png)
 
### Published Actor
![CAREMAP published Actor](https://raw.githubusercontent.com/Nekah-Lumina/caremap/main/screenshots/caremap-actor-page.png)

## Actor inputs

**healthArea**

The health area to investigate. See "Supported health areas" above for the
full list.

Examples:

```
maternal health
reproductive health
child health
mental health
dental care
eye care
rehabilitation
laboratory services
```

**location**

The Nigerian state, city, or geographic area to focus on.

Example:

```
Lagos
```

**maxOrganizations**

Maximum number of organization records to return.

**includeEvidence**

Whether supporting public source information should be collected.

## Output

CAREMAP writes structured organization records to the Actor dataset.

Each organization can include:

- organizationId
- name
- organizationType
- description
- healthAreas
- services
- serviceClaims
- targetPopulation
- locations
- access
- evidence
- evidenceStatus
- sourceUrls
- lastVerifiedAt

If a run finds no matching organizations, the dataset (or run log, at
minimum) carries the formatted no-results summary described above instead
of an unexplained empty result.

## Built for more than a directory

CAREMAP is designed as an evidence layer for healthcare discovery.

The current MVP focuses on publicly discoverable health organizations and
services. The architecture is designed to expand to:

- Hospitals
- Clinics
- Primary healthcare centres
- Laboratories
- Imaging centres
- Pharmacies
- Government health facilities
- Health NGOs
- Additional Nigerian states
- Additional health domains

## Important limitations

CAREMAP works with publicly available information.

It does not guarantee that:

- a facility is currently operating
- a service is currently available
- a service has available capacity
- a published phone number is still active
- a website accurately reflects current operations

Healthcare organizations can change their services, hours, requirements,
and contact information without updating every public source.

CAREMAP therefore presents public evidence and its freshness, rather than
pretending that scraped information is ground truth.

CAREMAP is a healthcare information and discovery tool. It is not a
clinical decision-making system and should not be used as a substitute for
professional medical advice or emergency services.

## Privacy

The current Actor is designed around publicly available organizational
information.

It does not require patients to submit medical records or personal health
information.

## Technology

CAREMAP is built with:

- Apify Actors
- Crawlee
- TypeScript
- Node.js
- Structured dataset outputs
- Evidence-aware extraction
- Entity resolution and source merging

Apify provides the collection and execution infrastructure that allows
CAREMAP to turn fragmented public healthcare information into structured,
reusable data.

## Roadmap

Future capabilities can include:

- More authoritative healthcare registries
- More source types
- Deeper service-level evidence
- Geographic service-gap analysis
- Freshness monitoring
- Source conflict detection
- Healthcare pathway and referral dependencies
- Scheduled evidence refreshes
- API and research-data integrations
- Coverage across additional Nigerian states

## The bigger idea

Most healthcare directories answer:

"Where is healthcare?"

CAREMAP is designed to answer:

"Who provides this care, where are they, what do they publicly claim to
offer, and what evidence do we have?"

CAREMAP

Don't just find care. Map the evidence behind it.