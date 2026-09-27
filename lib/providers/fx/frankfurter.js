// ECB reference rates through Frankfurter (free, no key). Published once per working day.
export const SOURCE = { name: 'BCE via Frankfurter', url: 'https://www.frankfurter.app' };

export function parseRates(json) {
  if (!json?.rates || typeof json.rates.USD !== 'number' || typeof json.rates.GBP !== 'number') {
    throw new Error('Frankfurter: réponse inattendue');
  }
  // 1 EUR = x USD  ->  1 USD = 1/x EUR
  return {
    date: json.date,
    eurPer: { EUR: 1, USD: 1 / json.rates.USD, GBP: 1 / json.rates.GBP },
    raw: { EURUSD: json.rates.USD, EURGBP: json.rates.GBP },
  };
}

export async function fetchRates(fetchImpl = fetch) {
  const res = await fetchImpl('https://api.frankfurter.app/latest?from=EUR&to=USD,GBP', { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
  return parseRates(await res.json());
}
