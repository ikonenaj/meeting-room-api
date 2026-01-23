#### 1. Mitä tekoäly teki hyvin

Tekoälyn luoma ensimmäinen versio rajapinnasta oli toiminnallinen ja se täytti sille asetetut vaatimukset.

Tekoäly kirjoitti kattavat yksikkötestit niitä pyydettäessä ja onnistui lisäämään tarvittaessa uusia testejä jotka sopivat yhteen aiemmin kirjoitettujen testien kanssa. Tämä säästi valtavasti aikaa, koska testitiedosto vaati hyvin vähän manuaalista muokkaamista.

Multi-stage build Dockerfile-pohja oli erittäin hyvä, eikä vaatinut kuin hyvin pientä muokkaamista.

#### 2. Mitä tekoäly teki huonosti?

Alkuperäinen tekoälyn luoma sovellus oli yhdessä tiedostossa eikä toiminnallisuutta ollut jaettu useampaan tiedostoon, ts. se ei toteuttanut Separation of concerns -periaatetta.

Huoneille ei ollut omaa tyyppiä.

Sovelluksesta puuttui tyyppien validointi.

Jotkin virhekoodit olisivat voineet olla kuvaavampia, esim. tilanteissa joihin statuskoodit 403 (liian monta varausta) ja 409 (varaukset menevät päällekkäin) olisivat sopineet parhaiten, sovellus palautti statuskoodin 400.

Yksikkötestejä luodessa tekoäly ei tyhjentänyt tietokantaa ennen testien ajamista, mikä sai testit palauttaamaan virheellisesti erroreita.

Dockerfilessä käyttäjää ei vaihdettu pois oletuskäyttäjästä, jolla on root-oikeudet.


#### 3. Mitkä olivat tärkeimmät parannukset, jotka teit tekoälyn tuottamaan koodiin ja miksi?

Refaktoroin koodin eri osia eri tiedostoihin arkkitehtuurin selkeyttämiseksi ja jotta sovelluksen kasvaessa samaa logiikkaa ei tule implementoitua moneen eri kohtaan koodissa. Esim. lopullisessa versiossa express-funktiot eivät käsittele business-logiikkaa, vaan se on keskitetty reservationService.ts moduuliin. Logiikka on uudelleenkäytettävissä kun se on siirretty pois express-funktioista. Logiikkaa tarvitsee päivittää vain yhdessä paikassa, eli servicessä, jonka jälkeen se on käytettävissä muissa sovelluksen osissa, jotka kutsuvat servicen funktioita. 

Tekoälyn luomat funktiot olivat synkronisia, koska in-memory tietokanta toimii syknronisilla funktioilla. Vaihdoin nämä funktiot asynkronisiksi, jotta tietokannan vaihtaminen oikeaan tietokantaan ei vaadi yhtä suurta refaktorointia jokaiseen funktioon.

Korjasin myös kaikki muut tekoälyn virheet/huolimattomuudet, jotka on mainittu kohdassa 2.
