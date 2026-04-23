# PodPaiGo

A smart airport companion for SeaTac Airport, providing personalized recommendations for parking, rideshare, and public transit options.

## Features

- **Trip Planning**: Input your flight details to get tailored recommendations
- **Parking Options**: Compare official and off-airport parking
- **Rideshare & Transit**: Find the best transportation to/from the airport
- **TSA Estimates**: Get wait time predictions for security checkpoints
- **Mock Data**: Uses realistic mock data for all services

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Architecture**: Clean domain logic with mock provider layer

## Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, pnpm, or bun

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Run the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
app/
├── page.tsx          # Landing page
├── trip/page.tsx     # Trip planning form
├── results/page.tsx  # Recommendations display
lib/
├── types.ts          # TypeScript type definitions
├── recommendationEngine.ts  # Business logic and mock providers
data/
├── mockData.ts       # Mock data for all services
```

## Architecture

- **Domain Logic**: Pure functions in `lib/recommendationEngine.ts` for easy testing
- **Mock Providers**: Simulated API calls in `MockProvider` class
- **Data Layer**: Static mock data in `data/mockData.ts`
- **UI**: Simple Tailwind CSS components

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Testing

The domain logic is designed to be testable. Add unit tests for functions in `lib/recommendationEngine.ts`.

## Future Enhancements

- Real API integrations
- User authentication
- Payment processing
- Real-time availability
- Advanced recommendation algorithms
