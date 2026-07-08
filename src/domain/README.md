# Domain Projection Guidelines

Questory still persists the existing flattened `Game` shape. New provider-specific
facts should not be added directly to `Game` without first deciding whether the
field belongs to one of these projections or owner concepts:

- provider links, such as Steam app ids, RAWG ids, store URLs, and match sources
- provider state, such as Steam playtime or achievements
- provider-neutral achievement progress before exposing Steam-specific achievement fields
- metadata snapshots, such as RAWG or HLTB facts
- `ArtworkSet`, for selected/candidate artwork assets
- wishlist deal information, such as ITAD or Steam price/review snapshots
- recommendation candidates, when a service needs scoring inputs rather than full collection records
- library user state, such as notes, status, rating, tags, and completion

These guidelines are advisory for incremental refactors only; they do not imply
a storage migration or schema split.
