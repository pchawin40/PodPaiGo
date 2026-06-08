# PodPaiGo Event Parking Rules

When working on PodPaiGo routing, parking, recommendation, or destination-classification logic, treat sports games, stadiums, arenas, concerts, conventions, and large venues as event trips.

## Event venue detection

A destination should be treated as an event venue when any of the following are true:

* Venue category includes stadium, arena, ballpark, field, coliseum, convention center, amphitheater, theater, concert hall, expo center, raceway, fairgrounds, or major event venue.
* Destination name includes terms like stadium, arena, field, ballpark, coliseum, center, theatre, theater, amphitheatre, amphitheater, speedway, raceway, or convention center.
* Destination is a known sports/event venue such as Lumen Field, T-Mobile Park, Climate Pledge Arena, Allegiant Stadium, Soldier Field, MetLife Stadium, SoFi Stadium, AT&T Stadium, etc.
* User trip text includes phrases like game, match, concert, event, Seahawks, Raiders, Bears, Giants, NFL, MLB, NBA, NHL, soccer, football, baseball, basketball, hockey, or tailgate.
* Destination and travel time are close to a scheduled event window, if event/schedule data is available.

## Event parking behavior

For event venues, do not recommend street/meter parking as the primary option unless there is strong verified evidence that it is allowed and practical for the event window.

Street/meter parking around stadiums should be treated as:

* low confidence,
* likely restricted,
* likely expensive,
* likely unavailable,
* possibly time-limited,
* possibly event-zone controlled,
* risky for towing or tickets.

Default event parking priority:

1. Official venue parking or prepaid event parking
2. Verified nearby paid lots/garages
3. Transit/light rail/park & ride
4. Rideshare/dropoff
5. Street/meter parking only as fallback

## Hero recommendation rules

If the destination is an event venue or sports game:

* Do not use "Free customer parking likely."
* Do not use "Street/meter parking likely" as the main hero.
* Do not use customer parking inference from nearby restaurants/retail.
* Do not treat a stadium like a normal local business.
* Do not assume free parking unless official event parking data says so.
* Prefer "Book event parking first" when official/prepaid parking exists.
* Prefer "Use transit or prepaid parking" when both are reasonable.
* Prefer "Take transit" when transit is cheaper and avoids event traffic.
* Prefer "Use rideshare" only when parking is unavailable/expensive or user selected no-parking preference.
* Show paid parking as event parking, not normal destination parking.

Suggested hero titles:

* "Book event parking first"
* "Use prepaid event parking"
* "Use transit or event parking"
* "Avoid street parking for this event"
* "Take transit to the game"
* "Use rideshare pickup/dropoff"

Suggested parking outlook copy:

"Event parking likely. Street parking may be restricted, full, time-limited, or tow-enforced during games and events. Use official/prepaid parking, transit, or verified lots."

## Sports game examples

These should trigger event parking behavior:

* Seahawks game at Lumen Field
* Seahawks vs Raiders game in Las Vegas at Allegiant Stadium
* Seahawks vs Bears game at Soldier Field
* Seahawks vs Giants game at MetLife Stadium
* Mariners game at T-Mobile Park
* Kraken game at Climate Pledge Arena
* Any NFL, MLB, NBA, NHL, MLS, college football, concert, or large event venue trip

## Event timing

If the user provides a game time or event time, include event buffers:

* Arrive 60–120 minutes early for NFL games.
* Add event traffic buffer.
* Add walking buffer from lot/transit/dropoff.
* Add exit congestion warning after the event.
* If event time is unknown, still classify the venue as event-sensitive but use cautious wording.

## Recommendation cards

For event venues, visible cards should include:

* Event parking / prepaid parking
* Paid garage/lot
* Transit
* Rideshare
* Park & Ride, when useful
* Street/meter parking only under "Fallback" or "More options"

Street/meter card copy should say:

"Risky during events. Check posted signs, event-zone rules, time limits, and towing restrictions."

## Tests required

Any change to event/stadium parking logic must include tests for:

1. Stadium destination should not produce "Free customer parking likely."
2. Stadium destination should not make street/meter parking the best overall recommendation.
3. Sports game text should trigger event parking mode.
4. Event parking or prepaid parking should be eligible to win.
5. Transit should be eligible to win for stadium trips.
6. Rideshare should be eligible to win when user chooses no-parking.
7. Street/meter should only appear as fallback unless strong evidence exists.
8. Airport parking logic must remain separate from event parking logic.
9. Normal suburban customer parking logic must still work for restaurants, grocery stores, retail, gyms, churches, schools, and clinics.
