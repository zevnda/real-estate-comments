// Parse address from meta title
export function parseAddressFromTitle(title, url) {
  console.log(`Parsing title: ${title}`)

  if (!title) return null

  // Both sites use the same title structure, so use consistent parsing
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

  let address, suburb, state, postcode

  if (parts.length === 2) {
    // Domain.com.au format: "29 Wollowra Street", "Cowra NSW 2794"
    address = parts[0].toLowerCase()

    // Parse the second part which contains suburb, state and postcode
    const suburbStatePostcode = parts[1]
    const suburbStatePostcodeMatch = suburbStatePostcode.match(/^(.+?)\s+(\w+)\s+(\d{4})$/)

    if (!suburbStatePostcodeMatch) {
      console.log(`Could not parse suburb, state and postcode from: ${suburbStatePostcode}`)
      return null
    }

    suburb = suburbStatePostcodeMatch[1].toLowerCase()
    state = suburbStatePostcodeMatch[2].toLowerCase()
    postcode = suburbStatePostcodeMatch[3]
  } else if (parts.length >= 3) {
    // Realestate.com.au format: "29 Wollowra Street", "Cowra", "NSW 2794"
    address = parts[0].toLowerCase()
    suburb = parts[1].toLowerCase()

    // Handle the state and postcode - they might be combined in one part
    const statePostcodePart = parts[2]
    const statePostcodeMatch = statePostcodePart.match(/^(\w+)\s+(\d{4})$/)

    if (!statePostcodeMatch) {
      console.log(`Could not parse state and postcode from: ${statePostcodePart}`)
      return null
    }

    state = statePostcodeMatch[1].toLowerCase()
    postcode = statePostcodeMatch[2]
  } else {
    console.log(`Not enough parts: ${parts.length}`)
    return null
  }

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
