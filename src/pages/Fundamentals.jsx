import { Pending } from '../components/Pending.jsx';

const ROWS = [
  { name: 'Météo Afrique de l’Ouest', source: 'Open-Meteo · anomalies de pluie CI, Ghana, Nigeria, Cameroun' },
  { name: 'ENSO / El Niño', source: 'NOAA CPC · Niño 3.4, Niño 1+2, probabilités IRI' },
  { name: 'Production', source: 'ICCO, COCOBOD, CCC · saisie assistée avec source' },
  { name: 'Arrivages Côte d’Ivoire', source: 'Estimations d’exportateurs · saisie assistée' },
  { name: 'Stocks ICE', source: 'ICE Report Center · stocks certifiés' },
  { name: 'Demande (grindings)', source: 'ECA, NCA, CAA · trimestriel' },
  { name: 'Positioning', source: 'CFTC COT · Managed Money, percentiles sur 3 ans' },
];

export function Fundamentals() {
  return (
    <Pending eyebrow="Biais fondamental" title="Fondamentaux" phase="phase 4"
      lead="Chaque facteur sera noté de −2 à +2 par une règle écrite, avec sa source et sa fraîcheur. Un facteur sans donnée ne sera jamais compté."
      rows={ROWS} />
  );
}
