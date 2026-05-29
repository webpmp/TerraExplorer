# ==========================================
# Stage 1: Build the React Application
# ==========================================
FROM node:20-alpine AS build

# Set the working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (use npm ci for clean, reproducible installations)
RUN npm ci

# Copy the rest of the application files
COPY . .

# Set build argument for Gemini API Key
# Note: Vite injects this key into the bundle at build-time.
ARG GEMINI_API_KEY
ENV GEMINI_API_KEY=${GEMINI_API_KEY}

# Build the production application
RUN npm run build

# ==========================================
# Stage 2: Serve with Nginx
# ==========================================
FROM nginx:alpine

# Copy custom Nginx configuration for Single Page Application (SPA) routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy production build artifacts from the build stage to Nginx HTML directory
COPY --from=build /app/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
