/** Lighthouse CI against the live site. Warns below the brief’s targets; it does not fail the deploy. */
module.exports = {
  ci: {
    collect: {
      url: [
        'https://outza-outza.vercel.app/',
        'https://outza-outza.vercel.app/login',
        'https://outza-outza.vercel.app/local',
      ],
      numberOfRuns: 1,
      settings: {
        chromeFlags: '--no-sandbox --headless=new',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.9 }],
        'categories:accessibility': ['warn', { minScore: 0.95 }],
        'categories:best-practices': ['warn', { minScore: 0.95 }],
        'categories:seo': ['warn', { minScore: 0.95 }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
}
