"""The doorway.

It does exactly one job: establish who somebody really is, and hand that to the
database.

It does *not* decide what they may do. Thirteen migrations already decide that,
and those rules have been tested by attacking them. If the doorway started making
authorisation decisions too, there would be two sets of rules that could
disagree, and the disagreement is the vulnerability.

The two clocks, because one word was doing two jobs:

  · A **sign-in** lasts hours. It is what a person would call being logged in,
    and its length is a setting the Administrator controls.
  · A **request identity** lasts one click. It is attached when that click
    reaches the database and removed when the click finishes.

A building pass and a visitor badge. The pass lasts the day; the badge is handed
over at each interior door and taken back as you walk through.
"""
