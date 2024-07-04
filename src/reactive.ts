import { render } from "./main";

export const useReactive = <T extends object>(obj: T): T => {
	const wrapper = { obj };
	return new Proxy(wrapper, {
		get(target, key) {
			return target.obj;
		},
		set(target, key, value) {
			target.obj = value;
			render();
			return true;
		},
	}) as T;
};
