import { render } from "preact";
import { App } from "./app";
// Czcionki dołączone do strony (bez Google Fonts – telefony rodziców nie łączą się z Google).
// Tylko łacinka i łacinka rozszerzona (polskie znaki). Przeglądarka pobiera pliki tylko tych
// czcionek, których używa wybrany wygląd.
// Nowoczesny minimalistyczny: Geist (tekst), Geist Mono (godziny).
// Geist Sans ma jeden plik na grubość, z polskimi znakami (bez osobnego latin-ext).
import "@fontsource/geist-sans/latin-400.css";
import "@fontsource/geist-sans/latin-500.css";
import "@fontsource/geist-sans/latin-600.css";
import "@fontsource/geist-mono/latin-400.css";
import "@fontsource/geist-mono/latin-ext-400.css";
// Ciepły i przyjazny: Bricolage Grotesque (nagłówki), Figtree (tekst).
import "@fontsource/bricolage-grotesque/latin-700.css";
import "@fontsource/bricolage-grotesque/latin-ext-700.css";
import "@fontsource/figtree/latin-400.css";
import "@fontsource/figtree/latin-ext-400.css";
import "@fontsource/figtree/latin-600.css";
import "@fontsource/figtree/latin-ext-600.css";
import "@fontsource/figtree/latin-700.css";
import "@fontsource/figtree/latin-ext-700.css";
import "./styles.css";

render(<App />, document.getElementById("app")!);
