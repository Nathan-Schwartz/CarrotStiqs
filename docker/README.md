# Docker setup overview

`.docker.env`: Sets AMQP_URL and AMQP_MANAGEMENT_URL (uses docker hostnames).

`docker-compose.base.yml`: Contains only the RabbitMQ image

`docker-compose.yml`: Contains only the RabbitMQ image, but separated because it may evolve in the future. Located in root directory for convenience.

`docker-compose.ci.yml`: Contains the RabbitMQ image and carrotstiqs testing image

`carrotstiqs_tests.Dockerfile`: Adds source and test files to an image. Start scipt doesn't do anything, it just keeps the container up so we can run tests.
