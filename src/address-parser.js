// Parse address from meta title
export function parseAddressFromTitle(title, url) {
  console.log(`Parsing title: ${title}`)

  if (!title) return null

  // Extract the address portion before " - " (hyphen with spaces on both sides)
  const match = title.match(/^(.+?)\s+-\s+/)
  if (!match) {
    console.log('No match found with regex')
    return null
  }

  const addressPart = match[1].trim()
  console.log(`Address part extracted: ${addressPart}`)

  // Split by commas and extract components
  const parts = addressPart.split(',').map(part => part.trim())
  console.log(`Address parts: ${JSON.stringify(parts)}`)

  if (parts.length < 3) {
    console.log(`Not enough parts: ${parts.length}`)
    return null
  }

  const address = parts[0].toLowerCase()
  const suburb = parts[1].toLowerCase()

  // Handle the state and postcode - they might be combined in one part
  const statePostcodePart = parts[2]
  const statePostcodeMatch = statePostcodePart.match(/^(\w+)\s+(\d{4})$/)

  if (!statePostcodeMatch) {
    console.log(`Could not parse state and postcode from: ${statePostcodePart}`)
    return null
  }

  const state = statePostcodeMatch[1].toLowerCase()
  const postcode = statePostcodeMatch[2]

  const result = {
    address,
    suburb,
    state,
    postcode,
    url,
  }

  console.log(`Parsed result: ${JSON.stringify(result)}`)
  return result
}
