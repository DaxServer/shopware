import { Component, State, Mixin } from 'src/core/shopware';
import { warn } from 'src/core/service/utils/debug.utils';
import utils from 'src/core/service/util.service';
import template from './sw-settings-rule-detail.html.twig';
import './sw-settings-rule-detail.less';

Component.register('sw-settings-rule-detail', {
    template,

    inject: ['ruleConditionService'],
    mixins: [
        Mixin.getByName('notification')
    ],

    data() {
        return {
            rule: {},
            nestedConditions: {},
            conditionAssociations: {}
        };
    },

    computed: {
        ruleStore() {
            return State.getStore('rule');
        }
    },

    created() {
        this.createdComponent();
    },

    methods: {
        createdComponent() {
            if (!this.$route.params.id) {
                return;
            }

            this.rule = this.ruleStore.getById(this.$route.params.id);

            this.conditionAssociations = this.rule.getAssociation('conditions');
            this.conditionAssociations.getList({
                page: 1,
                limit: 500
            }).then(() => {
                this.nestedConditions = this.buildNestedConditions(this.rule.conditions, null);

                this.$nextTick(() => {
                    this.$refs.mainContainer.$emit('finish-loading', this.nestedConditions);
                });
            });
        },

        buildNestedConditions(conditions, parentId) {
            const nestedConditions = conditions.reduce((accumulator, current) => {
                if (current.parentId === parentId) {
                    const children = this.buildNestedConditions(conditions, current.id);
                    children.forEach((child) => {
                        if (current.children.indexOf(child) === -1) {
                            current.children.push(child);
                        }
                    });

                    accumulator.push(current);
                }

                return accumulator;
            }, []);

            if (parentId !== null) {
                return nestedConditions;
            }

            return this.checkRootContainer(nestedConditions);
        },

        checkRootContainer(nestedConditions) {
            if (nestedConditions.length === 1
                && nestedConditions[0].type === 'Shopware\\Core\\Framework\\Rule\\Container\\OrRule') {
                if (nestedConditions[0].children.length > 0) {
                    return nestedConditions[0];
                }

                nestedConditions[0].children = [
                    this.createCondition(
                        'Shopware\\Core\\Framework\\Rule\\Container\\AndRule',
                        utils.createId(),
                        nestedConditions[0].id
                    )
                ];

                return nestedConditions[0];
            }

            const rootId = utils.createId();
            const rootRole = this.createCondition(
                'Shopware\\Core\\Framework\\Rule\\Container\\OrRule',
                rootId,
                null
            );

            rootRole.children = [
                this.createCondition(
                    'Shopware\\Core\\Framework\\Rule\\Container\\AndRule',
                    utils.createId(),
                    rootId,
                    nestedConditions
                )
            ];

            return rootRole;
        },

        createCondition(type, conditionId, parentId = null, children) {
            const conditionData = {
                type: type,
                parentId: parentId
            };

            if (children) {
                children.forEach((child) => {
                    child.parentId = conditionId;
                });
                conditionData.children = children;
            }

            return Object.assign(this.conditionAssociations.create(conditionId), conditionData);
        },

        onSave() {
            const titleSaveSuccess = this.$tc('sw-settings-rule.detail.titleSaveSuccess');
            const messageSaveSuccess = this.$tc(
                'sw-settings-rule.detail.messageSaveSuccess',
                0,
                { name: this.rule.name }
            );

            const titleSaveError = this.$tc('sw-settings-rule.detail.titleSaveError');
            const messageSaveError = this.$tc(
                'sw-settings-rule.detail.messageSaveError', 0, { name: this.rule.name }
            );

            this.rule.conditions = [this.nestedConditions];
            this.removeOriginalConditionTypes(this.rule.conditions);

            return this.rule.save().then(() => {
                this.createNotificationSuccess({
                    title: titleSaveSuccess,
                    message: messageSaveSuccess
                });
                this.$emit('on-save-rule');
            }).catch((exception) => {
                this.createNotificationError({
                    title: titleSaveError,
                    message: messageSaveError
                });
                warn(this._name, exception.message, exception.response);
                this.$emit('on-save-rule');
            });
        },

        removeOriginalConditionTypes(conditions) {
            conditions.forEach((condition) => {
                if (condition.children) {
                    this.removeOriginalConditionTypes(condition.children);
                }

                if (typeof condition.getChanges !== 'function') {
                    return;
                }

                const changes = Object.keys(condition.getChanges()).length;
                if (changes && condition.isDeleted !== true) {
                    condition.original.type = '';
                    condition.original.value = {};
                }
            });
        }
    }
});
