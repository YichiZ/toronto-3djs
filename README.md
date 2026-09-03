# toronto-3djs

An autonomous build brief for a browser-scale 3D reconstruction of **Union Station and
downtown Toronto**, to be built as a pure Three.js web application.

[`PROMPT.md`](PROMPT.md) is the whole repository so far. Nothing has been built from it yet.

## What it is

One self-contained prompt: reconnaissance plan, parallel-agent breakdown, geospatial
coordinate system, per-block reconstruction scope, hero interiors (the Great Hall, the
Hockey Hall of Fame, Brookfield Place's Allen Lambert Galleria, a PATH segment),
pedestrian and traffic systems, LOD and streaming budgets, and an adversarial QA bar the
result has to clear.

Adapted from an equivalent brief for San Francisco's Union Square, restructured around
what actually makes this part of Toronto legible: the rail viaduct and its underpasses,
the PATH below it, the Gardiner above Lake Shore, the ~16.7° rotation of the downtown
grid, and the CN Tower's bearing from the station.

## The traps list

The brief carries a `KNOWN HALLUCINATION TRAPS` section — the things a model that "knows
Toronto" from stereotypes gets wrong: streetcars on Front Street, the destination frieze
on the *outside* of the station, an exterior dome on the Hockey Hall of Fame. It exists
because the failure mode of a brief like this is confident invention, not omission.

## Status

Reviewed and fact-checked against OpenStreetMap, City of Toronto open data and published
sources. Every figure in it is still a hypothesis to verify at build time — the brief
says so itself.
