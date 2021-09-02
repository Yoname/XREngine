import { getComponent, addComponent, removeComponent } from '../../ecs/functions/EntityFunctions'
import { MapComponent } from '../MapComponent'
import { Entity } from '../../ecs/classes/Entity'
import { ECSWorld } from '../../ecs/classes/World'
import { createMapObjects } from '..'
import { Object3DComponent } from '../../scene/components/Object3DComponent'
import { TransformComponent } from '../../transform/components/TransformComponent'

export async function refreshSceneObjects(mapEntity: Entity, ecsWorld: ECSWorld): Promise<void> {
  const map = getComponent(mapEntity, MapComponent, false, ecsWorld)
  const { mapMesh } = await createMapObjects(map.center, map.minimumSceneRadius, map.args)
  const mapTransform = getComponent(mapEntity, TransformComponent, false, ecsWorld)
  const viewerTransform = getComponent(map.viewer, TransformComponent, false, ecsWorld)

  removeComponent(mapEntity, Object3DComponent, ecsWorld)
  // TODO try using a setImmediate around addComponent
  addComponent(mapEntity, Object3DComponent, { value: mapMesh }, ecsWorld)

  mapTransform.position.copy(viewerTransform.position)
}
