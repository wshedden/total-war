export function wireSearch(input, countries, actions) {
  input.addEventListener('input', () => actions.setSearch(input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const q = input.value.trim().toLowerCase();
    const match = countries.find((c) => c.name.toLowerCase().includes(q) || c.cca3.toLowerCase() === q);
    if (match) actions.selectCountry(match.cca3);
  });
}
