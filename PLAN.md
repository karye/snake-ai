Att låsa progressionen i appen enbart bakom "ett bra resultat" är en bristfällig pedagogisk design. I reinforcement learning är ett dysfunktionellt beteende – till exempel att ormen omedelbart åker in i väggen för att maximera poäng i en felkonstruerad belöningsfunktion – ett mycket starkt kvitto på att algoritmen gör exakt vad den blivit tillsagd. Om appen enbart släpper igenom elever vid höga poäng riskerar de att återfalla i blind gissning ("trial-and-error") tills dörren öppnas.

Progressionen bör istället styras av att eleven lyckas framkalla och identifiera specifika beteenden, både framgångsrika och misslyckade.

### Appens visuella gränssnitt

För att tvinga fram analys över tid måste gränssnittet spegla teorin. En tre-spalts-layout rekommenderas:

* **Vänster spalt (Kontrollpanel):** Här finns de parametrar som är upplåsta för den specifika nivån. Allt annat är låst eller dolt.
* **Mitten (Spelmotorn):** Visar ormen. Måste innehålla ett reglage för hastighet (från normal till "snabbspolning" utan renderad grafik) för att möjliggöra träning av tusentals episoder på sekunder.
* **Höger spalt (Analys):** Live-uppdaterade grafer. Minst två linjediagram behövs: en graf som visar glidande medelvärde för poäng per episod, och en som visar epsilon-värdet (utforskandegraden) över tid.

### Upplägg för nivåbaserad progression

Här är ett förslag på hur stegen kan organiseras för att isolera parametrar enligt en strikt metodik:

* **Nivå 1: Manipulering av belöningsfunktionen**
* **Tillgängliga variabler:** Belöning för äpple, bestraffning för död, belöning/bestraffning för att röra sig mot/bort från äpplet.
* **Pedagogiskt mål:** Förstå hur målfunktionen styr beteendet.
* **Krav för att gå vidare:** Eleven får inte i uppdrag att "få en bra orm". Uppdraget är istället tvådelat. Först: ställ in variablerna så att ormen medvetet begår självmord så snabbt som möjligt. Sedan: ställ in dem så att ormen undviker döden men vägrar äta äpplen (den snurrar i en trygg loop).


* **Nivå 2: Utforskande och utnyttjande (exploration vs. exploitation)**
* **Tillgängliga variabler:** Startvärde för epsilon, epsilon decay rate, minsta värde för epsilon. Belöningsfunktionen från förra steget är nu låst till optimala värden.
* **Pedagogiskt mål:** Förstå varför agenten måste testa nya saker och när den ska sluta med det.
* **Krav för att gå vidare:** Eleven måste ställa in "decay rate" så att inlärningskurvan i högra spalten stabiliseras (når över en viss snittpoäng) innan 500 episoder har gått. Om värdet är för högt stagnerar kurvan (agenten gissar bara), är det för lågt fastnar den i lokala minima.


* **Nivå 3: Inlärningshastighet och framtidssyn**
* **Tillgängliga variabler:** Alpha (learning rate) och Gamma (discount factor).
* **Pedagogiskt mål:** Hantera uppdateringen av Q-värden och vikten av framtida belöningar.
* **Krav för att gå vidare:** Här bör målet vara optimering. Eleven ska justera parametrarna för att nå en maximal snittlängd på ormen inom en given tidsram.



På detta sätt tvingas eleven titta på både agentens faktiska beteende och på inlärningskurvornas lutning för att ta sig framåt i laborationen.
