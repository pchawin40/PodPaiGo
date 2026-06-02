module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/lib', '<rootDir>/__tests__', '<rootDir>/app'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
    '**/?(*.)+(spec|test).ts',
    '**/?(*.)+(spec|test).tsx',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
        },
      },
    ],
  },
  collectCoverageFrom: [
    'lib/**/*.ts',
    '!lib/**/*.d.ts',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};