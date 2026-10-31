# Mesora domains

Business logic is grouped by area: security and identity, cashier operations, restaurant configuration, reporting, and platform administration. Each folder exposes its public API through index.ts.

src/lib/api.ts connects these domains to Supabase and keeps the local and demo adapters. Same-name files remaining in src/lib are compatibility facades for existing imports; new code should import from src/domain/<area>.
