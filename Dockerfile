# Base image: Ruby with necessary dependencies for Jekyll
FROM ruby:3.2

# Install dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    nodejs \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy Gemfile into the container (necessary for `bundle install`)
COPY Gemfile ./

# Configure gem source for faster downloads
RUN gem sources --clear-all && \
    gem sources --add https://gems.ruby-china.com/ && \
    bundle config mirror.https://rubygems.org https://gems.ruby-china.com

# Install bundler and dependencies
RUN gem install bundler:2.3.26 && bundle install --jobs 4 --retry 3

# Command to serve the Jekyll site
CMD ["jekyll", "serve", "-H", "0.0.0.0", "-w", "--config", "_config.yml,_config_docker.yml"]

