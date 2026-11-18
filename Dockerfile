FROM ubuntu:22.04

# Set environment variables to avoid interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update 
RUN apt-get install -y openjdk-25-jdk  
RUN apt-get install -y  curl  
RUN apt-get install -y  bash  
RUN apt-get install -y  python3 
RUN apt-get clean
RUN rm -rf /var/lib/apt/lists/*

# Set JAVA_HOME environment variable
ENV JAVA_HOME=/usr/lib/jvm/java-25-openjdk-amd64
ENV PATH="$JAVA_HOME/bin:$PATH"

# Install maven version 3.9.12
ARG MAVEN_VERSION=3.9.12
RUN curl -fsSL -o /tmp/maven.tgz https://archive.apache.org/dist/maven/maven-3/${MAVEN_VERSION}/binaries/apache-maven-${MAVEN_VERSION}-bin.tar.gz \
    && mkdir -p /opt/maven \
    && tar -xzf /tmp/maven.tgz -C /opt/maven --strip-components=1 \
    && rm /tmp/maven.tgz
# Add path to maven
ENV MAVEN_HOME=/opt/maven
ENV PATH="$MAVEN_HOME/bin:$PATH"

# Verify installation
RUN mvn --version
RUN java -version
RUN curl --version

WORKDIR /app

ENV NODE_VERSION=24.21.0
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
ENV NVM_DIR=/root/.nvm
RUN . "$NVM_DIR/nvm.sh" && nvm install ${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm use v${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm alias default v${NODE_VERSION}
ENV PATH="/root/.nvm/versions/node/v${NODE_VERSION}/bin/:${PATH}"

RUN . "$NVM_DIR/nvm.sh" && nvm --version
RUN node --version
RUN npm --version

COPY . /home/app

RUN mvn --no-transfer-progress -B -Pproduction -DskipTests -f /home/app/pom.xml clean package

RUN ["chmod", "+x", "/home/app/startup.sh"]
ENTRYPOINT ["/home/app/startup.sh","/home/app/target/diningcachingproxy-0.0.1.jar"]
