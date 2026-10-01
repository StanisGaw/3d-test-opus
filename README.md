# 3d-test-opus

Gra 3D/izometryczna (Three.js + TypeScript + Vite), odtworzona z `CODEBASE.md`.

## Sterowanie

| Urządzenie | Ruch | Celowanie / strzał | Akcje |
| --- | --- | --- | --- |
| Klawiatura + mysz | WASD | mysz / LPM | R przeładuj, Spacja unik, G/PPM granat, Q mina, T wieżyczka, E przeciążenie, Tab drzewko |
| Pad | lewa gałka | prawa gałka + RT | A unik, X przeładuj, RB granat, Y mina, B wieżyczka, LB przeciążenie |
| Telefon / tablet | lewa gałka (dotyk w lewej części ekranu) | prawa gałka (strzela po wychyleniu) | przyciski po prawej, ◀ ▶ lub dotknięcie slotu broni zmienia broń |

## Komendy

```bash
npm install
npm run dev      # serwer deweloperski
npm run build    # tsc + vite build
npm test         # vitest
```

## GitHub Pages

Workflow `.github/workflows/deploy.yml` buduje i publikuje grę po każdym pushu na `main`.
Jednorazowo: w repo wejdź w **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Adres: `https://<użytkownik>.github.io/<nazwa-repo>/`.
