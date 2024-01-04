import React, { MutableRefObject, useEffect, useRef, useState } from 'react'
import socketIOClient, { Socket } from 'socket.io-client'
import {
  Producer,
  Consumer,
  RtpCapabilities,
  Device,
  AppData,
  TransportOptions,
  Transport,
  DtlsParameters,
} from 'mediasoup-client/lib/types'

import { Device as Devices } from 'mediasoup-client'

interface JoinOrInitiateCallI {
  userType: 'DOCTOR' | 'SPECIALIST' | 'PATIENT' | 'GUARDIAN'
  userName: string
  userId: string
  callId: string | null
}
type stateType<T> = [T, React.Dispatch<React.SetStateAction<T>>]

type MediasoupLocalHolder = {
  device: Device | null
  producerTransport: Transport | null
  producer: {
    video: null | Producer
    audio: null | Producer
  }
  consumerTransports: { [key: string]: Transport }
  rtpCapabilities: null | RtpCapabilities
}

type SocketCallBackResponseType = {
  status: 'SUCCESS' | 'ERROR'
  data: any | { error: any }
}
type MediaTypes = 'video' | 'audio'

type OtherUser = {
  userId: string
  userName: string
  userType: string
  producerId?: string
  medias?: {
    video?: {
      stream: MediaStream
      paused: boolean
      consumer: Consumer
    }
    audio?: {
      stream: MediaStream
      paused: boolean
      consumer: Consumer
    }
  }
  producerPeerId?: string
}

export function logger(event: string, args: any) {
  console.log('-----**-----')
  console.log('event : ', event)
  console.log('args : ', args)
  console.log('-----***-----\n\n')
}

export async function createMediasoupDevice(
  rtpCapabilities: RtpCapabilities
): Promise<Device | undefined> {
  try {
    const device = new Devices()
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-load
    // Loads the device with RTP capabilities of the Router (server side)
    await device.load({
      routerRtpCapabilities: rtpCapabilities,
    })

    // once the device loads, create transport
    // createSendTransport();
    return device
  } catch (error) {
    throw new Error('Unable to Create Mediasoup Device')
  }
}
type MediaTrackType = {
  video: MediaStreamTrack
  audio: MediaStreamTrack
  mediaStream: MediaStream
}

const Sockets = () => {
  const [videoCallMetaData, setVideoCallMetaData] = useState<{
    callId: string
    peerId: string
  }>({
    callId: '',
    peerId: '',
  })
  const [callIdValue, setCallIdValue] = useState<any>()

  const [otherUsers, setOtherUsers]: stateType<OtherUser[] | undefined> =
    useState<OtherUser[]>()

  const [allUsers, setAllusers] = useState<any>({
    currentMedia: {},
    otherUsers: [],
  })

  const [mediaTrackGet, setMediaTrackGet] = useState<boolean>(false)

  const [getRoomId, setGetRoomId] = useState()
  const [userName, setUserName] = useState('')
  const [userName1, setUserName1] = useState('')

  const callIdRef: MutableRefObject<string | null> = useRef(null)

  const socketRef = useRef<null | Socket>(null)

  const refVideo = useRef<HTMLVideoElement>(null)
  const refVideo1 = useRef<HTMLVideoElement>(null)

  const joinOrInitiateCallDetailsRef = useRef<JoinOrInitiateCallI | null>(null)
  const mediaTrack = useRef<MediaTrackType>()

  const mediasoupHolder = useRef<MediasoupLocalHolder>({
    device: null,
    producerTransport: null,
    producer: {
      video: null,
      audio: null,
    },
    consumerTransports: {},
    rtpCapabilities: null,
  })

  useEffect(() => {
    const currentMediaTrack = {
      ...mediaTrack,
      userName: joinOrInitiateCallDetailsRef?.current?.userName,
      userId: joinOrInitiateCallDetailsRef?.current?.userId,
      userType: joinOrInitiateCallDetailsRef?.current?.userType,
      callId: joinOrInitiateCallDetailsRef?.current?.callId,
      isAudioPaused: false,
      isVideoPaused: false,
    }
    let streamOptions = otherUsers?.map((otherUser) => {
      const streamOption = {
        ...otherUser,
        isAudioPaused:
          otherUser.medias?.audio?.stream &&
          otherUser.medias?.audio?.paused === false
            ? true
            : false,
        isVideoPaused:
          otherUser.medias?.video?.stream &&
          otherUser.medias?.video.paused === false
            ? true
            : false,
      }
      return streamOption
    })

    setMediaTrackGet(false)
    const userStreamData = {
      currentMedia: currentMediaTrack,
      otherUsers: streamOptions || allUsers?.otherUsers,
    }

    setAllusers(userStreamData)
  }, [
    joinOrInitiateCallDetailsRef.current,
    videoCallMetaData,
    mediaTrackGet,
    otherUsers,
  ])

  useEffect(() => {
    setUserName(allUsers?.currentMedia?.userName)

    setUserName1(allUsers?.otherUsers?.[0]?.userName)

    if (allUsers) {
      // if (allUsers?.currentMedia?.userId === '123') {
      if (allUsers?.currentMedia?.current) {
        if (refVideo.current) {
          refVideo.current?.load()

          refVideo.current!.srcObject =
            allUsers?.currentMedia?.current?.mediaStream
          refVideo.current.muted = true
          setTimeout(function () {
            refVideo.current?.play()
          }, 1000)
        }
        if (allUsers?.otherUsers?.[0]?.medias) {
          refVideo1.current?.load()
          refVideo1.current!.srcObject =
            allUsers?.otherUsers?.[0]?.medias?.video?.stream
          refVideo1.current!.muted = true
          setTimeout(function () {
            refVideo1.current?.play()
          }, 1000)
        }
      }
    }
  }, [allUsers, allUsers?.currentMedia, allUsers?.otherUser])

  function setCallId() {
    return Math.floor(Math.random() * 200000).toString()
  }
  const joinOrCreateCall = async (
    userType: any,
    userName: string,
    userId: string,
    callId: any
  ) => {
    // setIsCallConnecting(true)
    joinOrInitiateCallDetailsRef.current = {
      userType: userType,
      userName: userName,
      userId: userId,
      callId: callId,
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
    if (!socketRef.current) {
      connectToSocket()
    }
  }

  const MEDIASOUP_SOCKET_ENDPOINT = process.env.WEBSOCKET_MEDIASOUP_URL || ''
  function connectToSocket() {
    if (!socketRef.current) {
      const _socket = socketIOClient(MEDIASOUP_SOCKET_ENDPOINT, {
        rejectUnauthorized: false,
      })
      _socket.on('connection-success', () => {
        socketRef.current = _socket

        subscriberToSocketEvents()
        joinOrInitiateCall()
        // setIsSocketConnected(true)
      })
    }
  }

  function joinOrInitiateCall() {
    if (!socketRef.current) return
    const _callId = joinOrInitiateCallDetailsRef.current?.callId
      ? joinOrInitiateCallDetailsRef.current.callId
      : callIdRef.current
      ? callIdRef.current
      : null

    socketRef.current.emit(
      'join-or-create-call',
      {
        userType: joinOrInitiateCallDetailsRef.current?.userType,
        userName: joinOrInitiateCallDetailsRef.current?.userName,
        userId: joinOrInitiateCallDetailsRef.current?.userId,
        callId: _callId,
        // isReconnect: isNetworkIssueRef.current,
      },
      async ({ status, data }: SocketCallBackResponseType) => {
        if (status === 'ERROR') return
        setVideoCallMetaData({
          callId: data.callId as string,
          peerId: data.peerId as string,
        })
        callIdRef.current = data.callId as string

        mediasoupHolder.current.rtpCapabilities =
          data.rtpCapabilities as RtpCapabilities
        logger('RtpCapabilities ', data.rtpCapabilities)
        mediasoupHolder.current.device = (await createMediasoupDevice(
          mediasoupHolder.current.rtpCapabilities as RtpCapabilities
        )) as Device
        // spinUpPreviousResources()
        // setIsCallConnecting(false)
        getMediaStream()
      }
    )
  }

  async function _createSendWebrtcTransport(mediaType: MediaTypes) {
    socketRef.current!.emit(
      'create-webrtc-transport',
      {},
      ({ status, data }: SocketCallBackResponseType) => {
        if (status === 'ERROR') return
        const producerTransport = (
          mediasoupHolder.current.device as Device
        ).createSendTransport(data as TransportOptions)
        mediasoupHolder.current.producerTransport = producerTransport
        _subscribeToProduceTransportEvents(producerTransport)
        _produceMediaToTransport(producerTransport, mediaType)
      }
    )
  }

  const _subscribeToProduceTransportEvents = (producerTransport: Transport) => {
    producerTransport.on(
      'connect',
      async (
        { dtlsParameters }: { dtlsParameters: DtlsParameters },
        callback,
        errorCallback
      ) => {
        logger('transportId ', producerTransport.id)
        logger('dtlsParameters ', dtlsParameters)

        try {
          socketRef.current!.emit(
            'webrtc-transport-connect',
            {
              transportId: producerTransport.id,
              dtlsParameters: dtlsParameters,
            },
            ({ status }: SocketCallBackResponseType) => {
              if (status === 'SUCCESS') {
                logger('_subscribeToProduceTransportEvents ', 'SUCCESS')
                callback()
              }
            }
          )
        } catch (error) {
          errorCallback(error as Error)
        }
      }
    )
    producerTransport.on(
      'produce',
      async (parameters, callback, errorCallback) => {
        try {
          logger('producerTransport-produce :: parameters ', parameters)
          // tell the server to create a Producer
          // with the following parameters and produce
          // and expect back a server side producer id
          // see server's socketRef.current.on('transport-produce', ...)
          socketRef.current!.emit(
            'webrtc-produce-stream',
            {
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters,
              transportId: producerTransport.id,
            },
            ({ status, data }: SocketCallBackResponseType) => {
              // Tell the transport that parameters were transmitted and provide it with the
              // server side producer's id.
              if (status !== 'SUCCESS') {
                throw new Error(data.error)
              }
              logger('webrtc-produce-stream :: ', 'SUCCESS')
              callback({ id: data.producerId })
            }
          )
        } catch (error) {
          errorCallback(error as Error)
        }
      }
    )
  }

  const _produceMediaToTransport = async (
    producerTransport: Transport,
    mediaType: MediaTypes
  ) => {
    const producer = await producerTransport.produce({
      track:
        mediaType === 'video'
          ? mediaTrack.current!.video
          : mediaTrack.current!.audio,
    })
    logger('_produceMediaToTransport :: producer ', producer)

    // producer.replaceTrack
    mediasoupHolder.current.producer[mediaType] = producer
  }

  const _createRecvWebrtcTransport = (
    producerId: string,
    userId: string,
    producerPeerId: string
  ) => {
    try {
      const consumerTransportState: { [key: string]: Transport } | null =
        mediasoupHolder.current.consumerTransports
      // return if already consuming
      if (consumerTransportState && consumerTransportState[producerId]) return
      socketRef.current!.emit(
        'create-webrtc-transport',
        {},
        ({ status, data }: SocketCallBackResponseType) => {
          if (status === 'ERROR') return
          logger('_createRecvWebrtcTransport :: data : ', data)
          const serverTransportId = data.id
          const consumerTransport = (
            mediasoupHolder.current.device as Device
          ).createRecvTransport(data as TransportOptions)
          mediasoupHolder.current.consumerTransports = {
            ...mediasoupHolder.current.consumerTransports,
            [serverTransportId]: consumerTransport,
          }
          _subscribeToConsumeTransportEvents(
            consumerTransport,
            serverTransportId,
            producerId
          )
          _consumeMediaFromTransport(
            consumerTransport,
            serverTransportId,
            producerId,
            userId,
            producerPeerId
          )
        }
      )
    } catch (error) {}
  }

  const _subscribeToConsumeTransportEvents = async (
    consumerTransport: Transport,
    serverTransportId: string,
    producerId: string
  ) => {
    consumerTransport.on(
      'connect',
      async (
        { dtlsParameters }: { dtlsParameters: DtlsParameters },
        callback,
        errorCallback
      ) => {
        logger(
          '_subscribeToConsumeTransportEvents :: dtlsParameters - ',
          dtlsParameters
        )
        try {
          socketRef.current!.emit(
            'webrtc-transport-connect',
            { transportId: serverTransportId, dtlsParameters: dtlsParameters },
            ({ status }: SocketCallBackResponseType) => {
              if (status === 'SUCCESS') {
                logger(
                  '_subscribeToConsumeTransportEvents - connect :: ',
                  'SUCCESS'
                )
                callback()
              }
            }
          )
        } catch (error) {
          errorCallback(error as Error)
        }
      }
    )
  }

  const _consumeMediaFromTransport = async (
    consumerTransport: Transport,
    serverTransportId: string,
    producerId: string,
    userId: string,
    producerPeerId: string
  ) => {
    socketRef.current!.emit(
      'webrtc-consume-stream',
      {
        rtpCapabilities: mediasoupHolder.current.rtpCapabilities,
        producerId: producerId,
        serverTransportId: serverTransportId,
      },
      async ({ status, data }: SocketCallBackResponseType) => {
        if (status === 'ERROR') return

        if (data && data.error) {
          console.log('Cannot Consume')
          return
        }

        // then consume with the local consumer transport
        // which creates a consumer
        const consumer: Consumer = await consumerTransport.consume({
          id: data.id,
          producerId: data.producerId,
          kind: data.kind,
          rtpParameters: data.rtpParameters,
        })

        logger(
          '_consumeMediaFromTransport rtpParameters : ',
          data.rtpParameters
        )

        // destructure and retrieve the video track from the producer
        const { track } = consumer
        logger('_consumeMediaFromTransport track :: ', track)

        const stream = new MediaStream([track])
        setOtherUsers((prevState) => {
          const result = prevState?.map((otherUser) => {
            if (otherUser.producerPeerId === producerPeerId) {
              const audio = otherUser.medias?.audio
              const video = otherUser.medias?.video
              const user: OtherUser = {
                userId: otherUser.userId,
                producerPeerId: otherUser.producerPeerId,
                producerId: producerId,
                userName: otherUser.userName,
                userType: otherUser.userType,
                medias: {
                  video: video,
                  audio: audio,
                  [data.kind]: {
                    stream: stream,
                    paused: false,
                    consumer: consumer,
                  },
                },
              }
              return user
            } else {
              return otherUser
            }
          })
          return result
        })

        consumer.on('transportclose', () => {
          consumer.close()
        })
        // the server consumer started with media paused
        // so we need to inform the server to resume
        socketRef.current!.emit(
          'webrtc-consume-stream-resume',
          {
            serverConsumerId: data.serverConsumerId,
          },
          ({ status }: SocketCallBackResponseType) => {
            if (status === 'SUCCESS') {
              console.log('consumed')
            }
          }
        )
      }
    )
  }

  function subscriberToSocketEvents() {
    socketRef.current?.onAny((event, ...args) => {
      console.log('-----**-----')
      console.log('event : ', event)
      console.log('args : ', args)
      console.log('-----***-----\n\n')
    })
    socketRef.current!.on('LOGGER', (data) => {
      console.log(data, 'logger')
    })
    socketRef.current!.on(
      'NEW_USER_JOINED',
      ({ userId, peerId, userName, userType }) => {
        if (userId === joinOrInitiateCallDetailsRef.current?.userId) return

        setOtherUsers((prevState) => {
          if (prevState?.find((user) => user.producerPeerId === peerId))
            return prevState
          /**
           * @situation when new_user is a reconnected user
           * Instead of adding as a new user, replace the peerId of the user
           */
          if (prevState?.find((user) => user.userId === userId)) {
            const result: OtherUser[] | undefined = prevState?.map(
              (otherUser) => {
                if (otherUser.userId === userId) {
                  return {
                    ...otherUser,
                    producerPeerId: peerId,
                  } as OtherUser
                } else {
                  return otherUser
                }
              }
            )
            return result
          } else {
            const result = [
              ...(prevState || []),
              {
                userId,
                producerPeerId: peerId,
                userName: userName,
                userType: userType,
              },
            ]
            return result
          }
        })
      }
    )

    socketRef.current!.on(
      'USER_STARTED_STREAMING',
      ({ userId, producerPeerId, producerId }) => {
        _createRecvWebrtcTransport(producerId, userId, producerPeerId)
      }
    )
  }

  const DEFAULT_MEDIA_CONSTRAINTS = {
    audio: true,
    video: { width: 300, height: 300, facingMode: 'user' },
  }
  async function getMediaStream(): Promise<{
    videoTrack: MediaStreamTrack
    audioTrack: MediaStreamTrack
    mediaStream: MediaStream
  }> {
    await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: 'user' },
    })
    await navigator.mediaDevices.enumerateDevices()
    const mediaStream = await navigator.mediaDevices.getUserMedia(
      DEFAULT_MEDIA_CONSTRAINTS
    )
    // Get the video and audio tracks from the media stream
    const videoTrack = mediaStream.getVideoTracks()[0]
    const audioTrack = mediaStream.getAudioTracks()[0]

    mediaTrack.current = {
      video: videoTrack as MediaStreamTrack,
      audio: audioTrack as MediaStreamTrack,
      mediaStream: mediaStream as MediaStream,
    }
    await _createSendWebrtcTransport('video')

    setMediaTrackGet(true)
  }

  const handleGetRoomId = (e: any) => {
    setGetRoomId(e.target.value)
  }

  const createOrJoinCall = () => {
    if (!getRoomId) {
      const id: any = setCallId()
      setCallIdValue(id)
      joinOrCreateCall('DOCTOR', 'doctor-1', '123', id)
    } else {
      joinOrCreateCall('Patient', 'patient', '124', getRoomId)
      setCallIdValue(getRoomId)
    }
  }

  return (
    <div className="main-container">
      <div className="sub-container">
        <h1>Client-Socket-Video</h1>
        <h2>RoomId:{callIdValue}</h2>
        <div className="Instruction">
          <h3>Instruction:</h3>
          <p>
            Create a New Call: Click the "Create Call" button, and a unique
            roomId will be generated. Share this roomId with others to join the
            call.
          </p>
          <p>
            Join an Ongoing Call: To join an existing call, enter the roomId in
            the input field and click the "Join Call" button.
          </p>
          <div>
            <p>Creating a New Call:</p>
            <ul>
              <li>Click the "Create Call" button.</li>
              <li>A new roomId will be generated for the call.</li>
              <li>Share this roomId with others to invite them to join.</li>
            </ul>
          </div>
          <div>
            <p>Joining an Existing Call:</p>
            <ul>
              <li>
                Enter the roomId of the ongoing call in the provided input
                field.
              </li>
              <li>Click the "Join Call" button.</li>
              <li>
                You will be connected to the ongoing call using the specified
                roomId.
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="container">
        <section className="video-containers">
          <div className="video-container">
            <video ref={refVideo} className="video"></video>
          </div>
          <p>userName:{userName}</p>
          <div className="button">
            <button className="create" onClick={() => createOrJoinCall()}>
              Create Call
            </button>
            <div className="Join-container">
              <button onClick={() => createOrJoinCall()}>Join Call</button>
              <input onChange={(e) => handleGetRoomId(e)} />
            </div>
          </div>
        </section>
        {allUsers?.otherUsers.length ? (
          <section className="video-containers">
            <div className="video-container1">
              <video ref={refVideo1} className="video"></video>
            </div>
            <p>OtherUser:{userName1}</p>
          </section>
        ) : null}
      </div>
    </div>
  )
}

export default Sockets
