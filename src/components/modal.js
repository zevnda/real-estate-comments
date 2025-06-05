// Create ToS modal
export function createToSModal() {
  // Check if modal already exists
  if (document.getElementById('tos-modal')) {
    return
  }

  const modal = document.createElement('div')
  modal.id = 'tos-modal'
  modal.className = 'tos-modal'
  modal.style.display = 'none'

  const modalContent = document.createElement('div')
  modalContent.className = 'tos-modal-content'

  const header = document.createElement('h3')
  header.textContent = 'Terms of Service'

  const content = document.createElement('div')
  content.className = 'tos-content'

  const introPara = document.createElement('p')
  introPara.textContent = 'Before posting comments about properties, please agree to the following terms:'
  content.appendChild(introPara)

  const termsList = document.createElement('ul')

  const terms = [
    'Your comments must be truthful and based on your actual experience with the property',
    'Do not post content that is defamatory, harassing, or discriminatory towards any individual or group',
    'Do not include personal information (phone numbers, emails, addresses) of landlords, agents, or tenants',
    'Comments must not violate any local, state, or federal laws',
    'Do not post spam, promotional content, or irrelevant information',
    'Respect the privacy of others and do not share private conversations or documents',
    'We reserve the right to moderate and remove comments that violate these terms',
  ]

  terms.forEach(termText => {
    const listItem = document.createElement('li')
    listItem.textContent = termText
    termsList.appendChild(listItem)
  })

  content.appendChild(termsList)

  const confirmPara = document.createElement('p')
  const strongText = document.createElement('strong')
  strongText.textContent = 'By clicking "I Agree", you confirm that you understand and will comply with these terms.'
  confirmPara.appendChild(strongText)
  content.appendChild(confirmPara)

  const buttonContainer = document.createElement('div')
  buttonContainer.className = 'tos-buttons'

  const declineBtn = document.createElement('button')
  declineBtn.className = 'tos-decline-btn'
  declineBtn.textContent = 'Decline'

  const agreeBtn = document.createElement('button')
  agreeBtn.className = 'tos-agree-btn'
  agreeBtn.textContent = 'I Agree'

  buttonContainer.appendChild(declineBtn)
  buttonContainer.appendChild(agreeBtn)

  modalContent.appendChild(header)
  modalContent.appendChild(content)
  modalContent.appendChild(buttonContainer)
  modal.appendChild(modalContent)

  document.body.appendChild(modal)

  // Add event listeners
  agreeBtn.addEventListener('click', () => {
    localStorage.setItem('tos-accepted', 'true')
    modal.style.display = 'none'
  })

  declineBtn.addEventListener('click', () => {
    modal.style.display = 'none'
  })

  // Close modal when clicking outside
  modal.addEventListener('click', e => {
    if (e.target === modal) {
      modal.style.display = 'none'
    }
  })
}

export function showToSModal() {
  const modal = document.getElementById('tos-modal')
  if (modal) {
    modal.style.display = 'flex'
  }
}

export function hasAcceptedToS() {
  return localStorage.getItem('tos-accepted') === 'true'
}
