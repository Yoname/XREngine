import { Application } from '../../../declarations'
import multer from 'multer'
import { Params } from '@feathersjs/feathers'
import hooks from './upload-asset.hooks'
import express from 'express'
import { AvatarUploadArguments } from '../../user/avatar/avatar-helper'
import restrictUserRole from '../../hooks/restrict-user-role'
import {
  AdminAssetUploadArgumentsType,
  AssetUploadType,
  IPFSUploadType
} from '@xrengine/common/src/interfaces/UploadAssetInterface'
import { useStorageProvider } from '../storageprovider/storageprovider'
import { useIPFSStorageProvider } from '../storageprovider/ipfsstorageprovider'
import { getCachedAsset } from '../storageprovider/getCachedAsset'
import { json, urlencoded, static as _static, rest, notFound, errorHandler } from '@feathersjs/express'

const multipartMiddleware = multer({ limits: { fieldSize: Infinity } })

declare module '../../../declarations' {
  interface ServiceTypes {
    'upload-asset': any
  }
}

export const addGenericAssetToS3AndStaticResources = async (
  app: Application,
  file: Buffer,
  args: AdminAssetUploadArgumentsType
) => {
  const provider = useStorageProvider()
  // make userId optional and safe for feathers create
  const userIdQuery = args.userId ? { userId: args.userId } : {}

  const existingAsset = await app.service('static-resource').find({
    query: {
      staticResourceType: args.staticResourceType,
      // safely spread conditional params so we can query by name if it is given, otherwise fall back to key
      ...(args.name ? { name: args.name } : { key: args.key }),
      ...userIdQuery
    }
  })

  const promises: Promise<any>[] = []

  // upload asset to storage provider
  promises.push(
    new Promise<void>(async (resolve) => {
      await provider.createInvalidation([args.key])
      await provider.putObject({
        Key: args.key,
        Body: file,
        ContentType: args.contentType
      })
      resolve()
    })
  )

  // add asset to static resources
  const assetURL = getCachedAsset(args.key, provider.cacheDomain)
  if (existingAsset.data.length) {
    promises.push(provider.deleteResources([existingAsset.data[0].id]))
    promises.push(
      app.service('static-resource').patch(
        existingAsset.data[0].id,
        {
          url: assetURL,
          key: args.key
        },
        { isInternal: true }
      )
    )
  } else {
    promises.push(
      app.service('static-resource').create(
        {
          name: args.name ?? null,
          mimeType: args.contentType,
          url: assetURL,
          key: args.key,
          staticResourceType: args.staticResourceType,
          ...userIdQuery
        },
        { isInternal: true }
      )
    )
  }

  await Promise.all(promises)
  return assetURL
}

export const addGenericAssetToIPFSAndStaticResources = async (
  app: Application,
  file: Buffer,
  args: AdminAssetUploadArgumentsType
) => {
  const provider = useIPFSStorageProvider()
  // make userId optional and safe for feathers create
  const userIdQuery = args.userId ? { userId: args.userId } : {}

  const existingAsset = await app.service('static-resource').find({
    query: {
      staticResourceType: args.staticResourceType,
      // safely spread conditional params so we can query by name if it is given, otherwise fall back to key
      ...(args.name ? { name: args.name } : { key: args.key }),
      ...userIdQuery
    }
  })

  const promises: Promise<any>[] = []

  // upload asset to storage provider
  promises.push(
    new Promise<void>(async (resolve) => {
      await provider.putObject({
        Key: args.key,
        Body: file,
        ContentType: args.contentType
      })
      resolve()
    })
  )

  // add asset to static resources
  const assetURL = getCachedAsset(args.key, provider.cacheDomain)

  /* if (existingAsset.data.length) {
    promises.push(provider.deleteResources([existingAsset.data[0].id]))
    promises.push(
      app.service('static-resource').patch(
        existingAsset.data[0].id,
        {
          url: assetURL,
          key: args.key
        },
        { isInternal: true }
      )
    )
  } else { */
  promises.push(
    app.service('static-resource').create(
      {
        name: args.name ?? null,
        mimeType: args.contentType,
        url: assetURL,
        key: args.key,
        staticResourceType: args.staticResourceType,
        ...userIdQuery
      },
      { isInternal: true }
    )
  )
  //}

  await Promise.all(promises)
  return assetURL
}

export const getIPFSAndStaticResource = async (key: string) => {
  const provider = useIPFSStorageProvider()

  return await provider.getObject(key)
}

export const deleteIPFSAndStaticResource = async (key: string) => {
  const provider = useIPFSStorageProvider()

  return await provider.deleteResource(key)
}

export default (app: Application): void => {
  app.use(
    'upload-asset',
    //multipartMiddleware.single('files'),
    multipartMiddleware.fields([{ name: 'media' }, { name: 'thumbnail' }]),
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (req?.feathers && req.method !== 'GET') {
        req.feathers.files = (req as any).files.media ? (req as any).files.media : (req as any).files
        req.feathers.args = (req as any).args
      }
      next()
    },
    {
      create: async (data: any, params?: Params) => {
        console.log('\n\nupload-asset', data, '\n\n')
        // console.log(params)
        if (data.type === 'user-avatar-upload') {
          return await app.service('avatar').create(
            {
              avatar: data.files[0],
              thumbnail: data.files[1],
              ...data.args
            } as AvatarUploadArguments,
            null!
          )
        } else if (data.type === 'admin-file-upload') {
          if (!(await restrictUserRole('admin')({ app, params } as any))) return
          return Promise.all(
            data.files.map((file, i) => addGenericAssetToS3AndStaticResources(app, file as Buffer, data.args[i]))
          )
        } else if (data.type === 'ipfs-file-upload') {
          if (!(await restrictUserRole('admin')({ app, params } as any))) return
          const argsData = JSON.parse(data.args)
          return Promise.all(
            params?.files.map((file, i) =>
              addGenericAssetToIPFSAndStaticResources(app, file.buffer as Buffer, { ...argsData[i] })
            )
          )
        }
      }
    }
  )
  const service = app.service('upload-asset')
  ;(service as any).hooks(hooks)
}
