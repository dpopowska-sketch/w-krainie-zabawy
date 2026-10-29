import { render } from "preact";
import { App } from "./app";
// Czcionki dołączone do strony (bez Google Fonts – telefony rodziców nie łączą się z Google).
// Tylko łacinka i łacinka rozszerzona (polskie znaki).
import "@fontsource/open-sans/latin-400.css";
import "@fontsource/open-sans/latin-ext-400.css";
import "@fontsource/open-sans/latin-600.css";
import "@fontsource/open-sans/latin-ext-600.css";
import "@fontsource/poppins/latin-600.css";
import "@fontsource/poppins/latin-ext-600.css";
import "@fontsource/poppins/latin-700.css";
import "@fontsource/poppins/latin-ext-700.css";
import "./styles.css";

render(<App />, document.getElementById("app")!);
