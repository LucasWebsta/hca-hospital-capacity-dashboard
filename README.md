# HCA Census Command Dashboard

A modern healthcare analytics dashboard built with React, TypeScript, and Tailwind CSS.

## Overview

This is a comprehensive hospital system management dashboard that displays:
- **Current Census Metrics**: Real-time occupancy data
- **Occupancy Trends**: Historical and forecast charts
- **Risk Assessment**: Facilities at risk indicators
- **Alerts & Notifications**: System-wide alerts and notifications
- **Forecasting**: 7-day and extended occupancy forecasts

## Features

- **Responsive Design**: Works seamlessly across different screen sizes
- **Interactive Charts**: Beautiful charts using Recharts for data visualization
- **Real-time Metrics**: Dashboard cards showing key hospital metrics
- **Alert Management**: Centralized alerts panel for notifications
- **Sidebar Navigation**: Easy navigation between dashboard sections
- **Professional UI**: Clean, modern interface following best practices

## Tech Stack

- **React 18**: Frontend framework
- **TypeScript**: Type-safe JavaScript
- **Tailwind CSS v4**: Utility-first CSS framework
- **Recharts**: React charting library
- **Lucide React**: Icon library
- **Vite**: Fast build tool

## Getting Started

### Prerequisites
- Node.js >= 16
- npm or yarn

### Installation

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

The development server runs on `http://localhost:5173/` with hot module reloading enabled.

## Project Structure

```
src/
├── components/
│   ├── Sidebar.tsx          # Main navigation sidebar
│   ├── Header.tsx           # Top navigation header
│   ├── MetricCard.tsx       # Dashboard metric cards
│   ├── OccupancyTrendChart.tsx  # Occupancy trend visualization
│   ├── ForecastOccupancyChart.tsx # Forecast chart
│   ├── FacilitiesAtRisk.tsx # Risk table
│   ├── AlertsPanel.tsx      # Alerts panel
│   └── index.ts             # Components barrel export
├── App.tsx                  # Main app component
├── App.css                  # App styles
├── index.css               # Global styles
└── main.tsx                # App entry point
```

## Components

### Sidebar
Navigation component with user profile and menu items to switch between different dashboard sections.

### Header
Top navigation bar with active view indicator, hospital filters, date range selectors, and search functionality.

### MetricCard
Reusable card component for displaying key metrics with trend indicators and supporting data.

### OccupancyTrendChart
Area chart showing occupancy trends over time with multiple data series (Overall, ICU, Emergency) with smooth animations.

### ForecastOccupancyChart
Line chart displaying forecast data with adjustable day-ahead parameters and statistical metrics (MAE, RMSE).

### FacilitiesAtRisk
Table component displaying hospitals ranked by occupancy risk with current census, occupancy percentages, and trend indicators.

### AlertsPanel
Sidebar panel showing active alerts, notifications, and alert management controls.

## Future Enhancements

- Real-time data integration with backend APIs
- Advanced filtering and search capabilities
- Custom report generation and scheduling
- User preferences and dashboard customization
- Dark mode support
- Mobile-responsive improvements
- Excel/CSV export functionality
- Email alert notifications
