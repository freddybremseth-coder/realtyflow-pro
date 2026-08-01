# Summary

This branch removes ambiguous PostgREST relationship embeds from the Media Studio asset and project collection endpoints. Existing generated assets and projects are already persisted correctly; the failed embeds were the reason the Library and Projects views returned no data.
