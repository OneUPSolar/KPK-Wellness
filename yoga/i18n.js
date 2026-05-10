// i18n.js - Single source of truth for translations in the /yoga section
const i18n = {
  navBrand: { en: 'School of Open Yoga', es: 'Escuela de Open Yoga' },
  navLive: { en: 'Live', es: 'En Vivo' },
  navRecorded: { en: 'Library', es: 'Biblioteca' },
  navAbout: { en: 'About', es: 'Acerca' },
  navContact: { en: 'Contact', es: 'Contacto' },

  // Landing Page
  landingEyebrow: { en: 'School of Open Yoga · Tijuana & San Diego', es: 'Escuela de Open Yoga · Tijuana y San Diego' },
  landingTitle: { en: 'Practice with intention.', es: 'Practica con intención.' },
  btnBeginSession: { en: 'Begin a Session', es: 'Comenzar una Sesión' },
  btnAbout: { en: 'About Karina', es: 'Acerca de Karina' },

  cardLiveTitle: { en: 'Live Sessions', es: 'Sesiones en Vivo' },
  cardLiveDesc: { en: 'Practice with Karina, accompanied by music that listens.', es: 'Practica con Karina, acompañada de música que escucha.' },
  cardLiveLink: { en: 'Enter Studio →', es: 'Entrar al Estudio →' },

  cardRecTitle: { en: 'Recorded Library', es: 'Biblioteca Grabada' },
  cardRecDesc: { en: 'Coming soon.', es: 'Próximamente.' },

  cardAboutTitle: { en: 'About Karina', es: 'Acerca de Karina' },
  cardAboutDesc: { en: 'Twenty years of practice, in two languages.', es: 'Veinte años de práctica, en dos idiomas.' },
  cardAboutLink: { en: 'Read Story →', es: 'Leer Historia →' },

  philosophyEyebrow: { en: 'Philosophy', es: 'Filosofía' },
  philosophyQuote: { en: '"She won\'t half-ass anything. If she\'s going to half-ass it, she just won\'t do it."', es: '"No hará nada a medias. Si lo va a hacer a medias, simplemente no lo hará."' },
  philosophyAuthor: { en: '— The standard of practice.', es: '— El estándar de práctica.' },

  // Live Session App
  liveTranscriptHeader: { en: 'Live Transcript', es: 'Transcripción en Vivo' },
  livePlaylistHeader: { en: 'Music Suggestions', es: 'Sugerencias de Música' },
  liveMoodHeader: { en: 'Detected Mood', es: 'Estado Detectado' },
  btnStartSession: { en: 'Start', es: 'Comenzar' },
  btnStopSession: { en: 'Stop', es: 'Detener' },
  btnConnectSpotify: { en: 'Connect Spotify', es: 'Conectar Spotify' },
  spotifyWait: { en: 'Listening for mood...', es: 'Escuchando estado de ánimo...' },
  spotifyError: { en: 'Could not fetch playlists', es: 'No se pudieron cargar listas' },

  // Recorded (Coming Soon)
  recTitle: { en: 'The Library is coming soon.', es: 'La Biblioteca llegará pronto.' },
  recDesc: { en: 'Join the waitlist to be notified when our recorded sessions are available.', es: 'Únete a la lista de espera para saber cuando las sesiones estén disponibles.' },
  recEmailPlaceholder: { en: 'Your email address', es: 'Tu correo electrónico' },
  btnNotify: { en: 'Notify Me', es: 'Notificarme' },

  // About Page
  aboutEyebrow: { en: 'Karina Paz Kennedy', es: 'Karina Paz Kennedy' },
  aboutTitle: { en: 'Master instructor. Chef. Mother.', es: 'Instructora máster. Chef. Madre.' },
  aboutP1: { en: 'With over 20 years of experience in both yoga and culinary arts, Karina is a bilingual native (English + Spanish) committed to the craft of living well.', es: 'Con más de 20 años de experiencia tanto en yoga como en artes culinarias, Karina es bilingüe nativa (Inglés y Español) comprometida con el arte del buen vivir.' },
  aboutP2: { en: 'Her teaching range is unusually wide—spanning kids, geriatric recovery, water yoga, and core yoga for athletes. This versatility comes from two decades of consistent practice, not generic platitudes.', es: 'Su rango de enseñanza es inusualmente amplio: abarca niños, recuperación geriátrica, yoga acuático y yoga central para atletas. Esta versatilidad proviene de dos décadas de práctica constante, no de clichés genéricos.' },
  aboutP3: { en: 'Refined, precise, and warm. She will correct your posture but never shame you. Her classes are a sanctuary grounded in the borderlands of Tijuana and San Diego.', es: 'Refinada, precisa y cálida. Corregirá tu postura pero nunca te hará sentir mal. Sus clases son un santuario arraigado en la frontera de Tijuana y San Diego.' },
  aboutQuote: { en: '"Every detail considered, no filler."', es: '"Cada detalle es considerado, sin relleno."' },
  aboutCreds: { en: 'Credentials', es: 'Credenciales' },
  cred1: { en: '20+ Years Yoga Practice', es: '20+ Años de Práctica de Yoga' },
  cred2: { en: 'Master Yoga Instructor', es: 'Instructora Máster de Yoga' },
  cred3: { en: 'Professional Chef', es: 'Chef Profesional' },
  cred4: { en: 'Bilingual Instruction (EN/ES)', es: 'Instrucción Bilingüe (EN/ES)' },

  // Footer
  footerTagline: { en: 'School of Open Yoga · A KPK Wellness Experience', es: 'Escuela de Open Yoga · Una Experiencia KPK Wellness' },
  footerRights: { en: '© 2026 KPK & Associates CBT. All rights reserved.', es: '© 2026 KPK & Associates CBT. Todos los derechos reservados.' },
  footerAddress: { en: '1309 Coffeen Avenue STE 1200 · Sheridan, WY 82801', es: '1309 Coffeen Avenue STE 1200 · Sheridan, WY 82801' }
};

// Expose globally
window.i18n = i18n;
