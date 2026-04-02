FROM mongo:6

RUN apt-get update && apt-get install -y jq bc redis-tools && \
    ln -s /usr/bin/mongosh /usr/bin/mongo && \
    rm -rf /var/lib/apt/lists/*

COPY throttle-adjuster.sh /usr/local/bin/throttle-adjuster.sh
RUN chmod +x /usr/local/bin/throttle-adjuster.sh

CMD ["/usr/local/bin/throttle-adjuster.sh"]
