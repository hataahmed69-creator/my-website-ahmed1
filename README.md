# NEXUS — Number System Converter

NEXUS is a browser-based tool for converting signed whole numbers between decimal, binary, octal, and hexadecimal. It also explains how each result is derived.

## Features

- Exact integer conversion with JavaScript `BigInt`, including inputs up to 2,000 digits.
- Step-by-step explanations for each supported conversion.
- Input examples, copyable results, and keyboard-accessible base selectors.
- Recent conversions saved in the current browser with `localStorage`.
- Responsive layout with reduced-motion support.

## Run locally

Open `index.html` in a modern browser. There is no build step or package installation.

The page loads its display fonts from Google Fonts and falls back to system sans-serif fonts.

## Project structure

```text
.
├── assets/       # Images and other static assets
├── index.html    # Page structure and content
├── script.js     # Conversion logic and interactions
├── style.css     # Layout, visual styles, and responsive rules
├── .gitignore
└── README.md
```

## Technology

Semantic HTML, CSS, and vanilla JavaScript. The converter uses `BigInt` for exact integer arithmetic.

## Related project

- [HUE — Coin Toss Simulation](https://github.com/hataahmed69-creator/my-website-ahmed)
