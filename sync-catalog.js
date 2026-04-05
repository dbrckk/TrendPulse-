function normalizeCategory(cat) {
  if (!cat) return 'general'

  const c = cat.toLowerCase().trim()

  if (c.includes('tech') || ['electronics','gadgets','gaming','computer','audio','phone'].includes(c))
    return 'tech'

  if (c.includes('home') || ['furniture','decor','storage','household'].includes(c))
    return 'home'

  if (c.includes('kitchen') || ['cooking','cookware','appliances'].includes(c))
    return 'kitchen'

  if (c.includes('beauty') || ['skincare','makeup','cosmetics'].includes(c))
    return 'beauty'

  if (c.includes('health') || ['fitness','wellness','supplements'].includes(c))
    return 'health'

  if (c.includes('sport') || c.includes('outdoor'))
    return 'sports'

  if (c.includes('travel') || ['luggage','bags'].includes(c))
    return 'travel'

  if (c.includes('fashion') || ['men','women','jewelry','shoes','watches'].includes(c))
    return 'fashion'

  if (c.includes('kid') || c.includes('baby') || c.includes('pet'))
    return 'family'

  return 'general'
}
