/**
 * Normaliza texto para busca em selects (case-insensitive, sem acentos).
 */
export function normalizeSelectSearch(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Filtra opções { value, label }[] pela query de busca.
 */
export function filterSelectOptions(options, query) {
  const normalizedQuery = normalizeSelectSearch(query);
  if (!normalizedQuery) return options;

  return options.filter((option) =>
    normalizeSelectSearch(option.label).includes(normalizedQuery),
  );
}
