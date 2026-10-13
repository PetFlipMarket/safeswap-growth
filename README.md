# SafeSwap Growth OS

The acquisition machine for SafeSwap. Its only job is bringing in new users.

- Reads SafeSwap data **read-only** (curated views in the `growth` schema)
- Writes only to the `growth` schema
- Never changes the SafeSwap app or messages existing users
