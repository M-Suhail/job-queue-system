# Job Queue Frontend

React dashboard for the Job Queue System with real-time updates via Socket.IO.

## Features

- 📊 Real-time job monitoring dashboard
- 🔍 Job filtering and search
- 📈 Queue metrics visualization
- 👷 Worker status panel
- 💀 Dead letter queue management
- ⏸️ Pause/Resume queue controls

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Testing

```bash
# Run unit tests (Vitest)
npm test

# Run tests in watch mode
npm run test:watch

# Run E2E tests (Playwright)
npx playwright install chromium  # First time only
npx playwright test

# Run E2E tests with UI
npx playwright test --ui

# View E2E test report
npx playwright show-report
```

### Test Coverage

| Type | Framework | Tests |
|------|-----------|-------|
| Unit Tests | Vitest | 89 |
| E2E Tests | Playwright | 11 |

## Project Structure

```
src/
├── api/           # API client and types
├── components/    # React components
│   ├── JobList/   # Job listing components
│   └── Layout/    # Layout components
├── hooks/         # Custom React hooks
├── pages/         # Page components
├── sockets/       # Socket.IO client
├── test/          # Test utilities
└── utils/         # Utility functions

e2e/               # Playwright E2E tests
```

## Environment

The frontend expects the API server at `http://localhost:3000` during development.

## Tech Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Socket.IO Client
- Vitest + React Testing Library
- Playwright
