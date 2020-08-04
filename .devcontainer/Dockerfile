FROM ubuntu:20.04

# x64 or armv6l
ARG arch=x64
ARG nodev=v8.11.1
ARG nodefile=node-${nodev}-linux-${arch}

USER root

# Install dependencies
RUN apt-get -yqq update && \
    apt-get -yqq --no-install-recommends install git build-essential bluetooth bluez libbluetooth-dev libudev-dev bluez-tools rfkill && \
    apt-get -yqq --no-install-recommends install wget libcap2-bin python mosquitto && \
    #if [ "${arch}" == "armv6l"]; then \
    #    apt-get -yqq --no-install-recommends install python-rpi.gpio; \
    #fi && \
    apt-get -yqq autoremove && \
    apt-get -yqq clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/* /tmp/* /var/tmp/*

RUN cd / && \
    wget --no-check-certificate --quiet http://nodejs.org/dist/${nodev}/${nodefile}.tar.gz && \
    tar -xzf ${nodefile}.tar.gz && \
    cd ${nodefile}/ && \
    cp -R * /usr/local/ && \
    cd / && \
    rm -r ${nodefile} && \
    rm ${nodefile}.tar.gz && \
    export PATH=$PATH:/usr/local/bin


RUN usermod -a -G bluetooth root && \
    setcap cap_net_raw+eip /usr/local/bin/node

EXPOSE 1888 1883

RUN mkdir /workspaces
    