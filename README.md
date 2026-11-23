# מילה במילה | Mot à Mot

משחק מילים בעברית ובצרפתית מול יריב ממוחשב, 24 שלבים. אתר סטטי שאפשר להתקין כאפליקציה (PWA).

- הרצה מקומית: `npx http-server . -p 5183`
- בדיקות: `npm test`
- בנייה מחדש של המילונים: להוריד את רשימות המקור אל `tools/raw/` ואז `npm run build:dict`

## מקורות המילים

- עברית: פרויקט [Hspell](http://hspell.ivrix.org.il/) (Nadav Har'El, Dan Kenigsberg), רישיון AGPL-3.0, דרך קובץ `he_IL.dic` של LibreOffice.
- צרפתית: [an-array-of-french-words](https://github.com/words/an-array-of-french-words), רישיון MIT.
