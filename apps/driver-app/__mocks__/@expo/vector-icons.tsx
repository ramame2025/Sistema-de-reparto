/**
 * Manual mock for `@expo/vector-icons`, siguiendo la misma convencion ya usada
 * para `expo-location` e `expo-image-picker` en este directorio: Jest lo
 * sustituye automaticamente, sin necesidad de `jest.mock(...)` en cada test.
 *
 * El componente real renderiza el glifo dentro de un <Text> interno, asi que
 * el `name` no queda visible en el nodo consultable y no hay forma de afirmar
 * CUAL icono se dibujo. Este mock lo expone como prop sobre un <Text>, que es
 * lo que permite verificar el cambio ojo -> ojo tachado.
 */
import React from 'react';
import { Text } from 'react-native';

type IconProps = {
  name?: string;
  size?: number;
  color?: string;
  testID?: string;
};

// `Text` no declara `name`/`size`/`color`, pero en un mock lo que importa es
// que esas props queden consultables desde el test.
const IconText = Text as unknown as React.ComponentType<IconProps>;

const makeIconSet = () =>
  function Icon({ name, size, color, testID }: IconProps) {
    return <IconText name={name} size={size} color={color} testID={testID} />;
  };

export const Ionicons = makeIconSet();
export const MaterialIcons = makeIconSet();
export const MaterialCommunityIcons = makeIconSet();
export const Feather = makeIconSet();
export const FontAwesome = makeIconSet();
