// Parse address from meta title
export function parseAddressFromTitle(title, url) {
  console.log(`Parsing title: ${title}`)

  if (!title) return null

  if (url.includes('domain.com.au/property-profile/')) {
    const pipeMatch = title.match(/^(.+?)\s+\|\s+/)
    if (!pipeMatch) {
      console.log('No pipe separator found in property-profile title')
      return null
    }
    const addressPart = pipeMatch[1].trim()
    console.log(`Property-profile address part extracted: ${addressPart}`)

    const parts = addressPart.split(',').map(part => part.trim())
    console.log(`Property-profile address parts: ${JSON.stringify(parts)}`)

    if (parts.length !== 2) {
      console.log(`Expected 2 parts for property-profile, got: ${parts.length}`)
      return null
    }

    const address = parts[0].toLowerCase()
    const suburb = parts[1].toLowerCase()

    // Extract state and postcode from URL
    const urlMatch = url.match(/-([a-z]{2,3})-(\d{4})(?:-|$)/)
    if (!urlMatch) {
      console.log('Could not extract state and postcode from property-profile URL')
      return null
    }

    const state = urlMatch[1].toLowerCase()
    const postcode = urlMatch[2]

    const result = {
      address: address.replace(/\s+-\s+/g, '-'),
      suburb,
      state,
      postcode,
      url,
    }

    console.log(`Property-profile parsed result: ${JSON.stringify(result)}`)
    return result
  }

  // Handle general domain.com.au URLs with pipe separator
  if (url.includes('domain.com.au') && title.includes(' | ')) {
    const pipeMatch = title.match(/^(.+?)\s+\|\s+/)
    if (!pipeMatch) {
      console.log('No pipe separator found in domain title')
      return null
    }
    const addressPart = pipeMatch[1].trim()
    console.log(`Domain address part extracted: ${addressPart}`)

    // Split by commas and extract components
    const parts = addressPart.split(',').map(part => part.trim())
    console.log(`Domain address parts: ${JSON.stringify(parts)}`)

    let address, suburb, state, postcode

    if (parts.length === 2) {
      address = parts[0].toLowerCase()

      // Parse the second part which contains suburb, state and postcode
      const suburbStatePostcode = parts[1]
      const suburbStatePostcodeMatch = suburbStatePostcode.match(/^(.+?)\s+(\w+)\s+(\d{4})/)

      if (!suburbStatePostcodeMatch) {
        console.log(`Could not parse suburb, state and postcode from: ${suburbStatePostcode}`)
        return null
      }

      suburb = suburbStatePostcodeMatch[1].toLowerCase()
      state = suburbStatePostcodeMatch[2].toLowerCase()
      postcode = suburbStatePostcodeMatch[3]
    } else {
      console.log(`Unexpected number of parts for domain URL: ${parts.length}`)
      return null
    }

    const result = {
      address: address.replace(/\s+-\s+/g, '-'),
      suburb,
      state,
      postcode,
      url,
    }

    console.log(`Domain parsed result: ${JSON.stringify(result)}`)
    return result
  }

  // Both sites use the same title structure, so use consistent parsing
  const lastDashIndex = title.lastIndexOf(' - ')
  if (lastDashIndex === -1) {
    console.log('No dash separator found')
    return null
  }
  const addressPart = title.substring(0, lastDashIndex).trim()
  console.log(`Address part extracted: ${addressPart}`)

  // Split by commas and extract components
  const parts = addressPart.split(',').map(part => part.trim())
  console.log(`Address parts: ${JSON.stringify(parts)}`)

  let address, suburb, state, postcode

  if (parts.length === 2) {
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
    address = parts[0].toLowerCase()
    suburb = parts[1].toLowerCase()

    // Handle the state and postcode - they might be combined in one part with additional text
    const statePostcodePart = parts[2]
    const statePostcodeMatch = statePostcodePart.match(/^(\w+)\s+(\d{4})/)

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
    address: address.replace(/\s+-\s+/g, '-'), // Format address: remove spaces around dashes
    suburb,
    state,
    postcode,
    url,
  }

  console.log(`Parsed result: ${JSON.stringify(result)}`)
  return result
}
