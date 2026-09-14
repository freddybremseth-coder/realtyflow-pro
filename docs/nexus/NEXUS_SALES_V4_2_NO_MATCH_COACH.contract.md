# No-Match Coach safety contract

The v4.2 No-Match Coach must preserve these invariants:

1. `nexus-no-match-followup` prepares only; it must not call a customer-send function.
2. Buyer Profile and buyer criteria remain unchanged until explicit customer evidence is reviewed and applied through the existing governed flow.
3. The coach proposes exactly one primary clarification question per no-match review item.
4. The Nexus Inbox must describe the artifact as prepared/reviewable, never as automatically sent.
5. A no-match review remains a human decision point before customer contact.
