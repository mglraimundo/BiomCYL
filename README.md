# BiomCYL

A web-based corneal astigmatism analyzer for ophthalmology professionals.

## Features

- **Anterior Keratometry Analysis**: Calculate corneal astigmatism from K1/K2 measurements
- **Posterior Keratometry Support**: Optional PK measurements (Zeiss IOLMaster 700)
- **AKRK Estimation**: Abulafia-Koch Regression for total corneal astigmatism
- **Total Keratometry**: Gaussian thick-lens formula with Liou-Brennan scaling
- **Patient Management**: Track patient name, ID, and eye selection
- **Print Reports**: Generate professional reports for clinical records

## Live Demo

Visit: https://mglraimundo.github.io/BiomCYL/

## Technology

- Vanilla JavaScript (no frameworks)
- Tailwind CSS (via CDN)
- Responsive mobile-first design
- Print-optimized layouts

## Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/mglraimundo/BiomCYL.git
   cd BiomCYL
   ```

2. Open `index.html` in your browser or use a local server:
   ```bash
   # Python 3
   python -m http.server 8000

   # Node.js
   npx serve
   ```

3. Navigate to `http://localhost:8000`

## Usage

1. Enter patient information (name, ID, select eye)
2. Input anterior keratometry values (K1, K2 with axes)
3. Optionally add posterior keratometry measurements
4. View real-time analysis results
5. Click "Print Report" to generate a clinical report

## Clinical Notes

- **AKRK**: Abulafia-Koch Regression estimates total corneal power
- **TK**: Total Keratometry requires measured posterior values
- **Liou-Brennan Scale Factor**: Calibrated to 1.0205 for IOLMaster 700 compatibility
- **Axis Convention**: WTR (With-The-Rule), ATR (Against-The-Rule), OBL (Oblique)

## License

Developed by Miguel Raimundo

## Contributing

Issues and pull requests are welcome at https://github.com/mglraimundo/BiomCYL
